import { Page } from "puppeteer";

// Raw payload

export interface ActionSequence {
  type: SourceType;
  id: string;
  parameters?: SourceParameters;
  actions: ActionItem[];
}

enum SourceType {
  pointer = "pointer",
  key = "key",
  none = "none",
}

interface SourceParameters {
  pointerType: PointerType;
}

enum PointerType {
  mouse = "mouse",
  pen = "pen",
  touch = "touch",
}

interface ActionItem {
  type: NullActionSubtype | KeyActionSubtype | PointerActionSubtype;
}

enum NullActionSubtype {
  pause = "pause",
}

enum KeyActionSubtype {
  keyDown = "keyDown",
  keyUp = "keyUp",
}

enum PointerActionSubtype {
  pointerDown = "pointerDown",
  pointerUp = "pointerUp",
  pointerMove = "pointerMove",
  pointerCancel = "pointerCancel",
}

interface NullActionItem extends ActionItem {
  type: NullActionSubtype;
  duration: number;
}

interface KeyActionItem extends ActionItem {
  type: KeyActionSubtype;
  value: string;
}

interface PointerActionItem extends ActionItem {
  type: PointerActionSubtype;
}

interface PointerUpDownActionItem extends PointerActionItem {
  type: PointerActionSubtype.pointerUp | PointerActionSubtype.pointerDown;
  button: number;
}

interface PointerMoveActionItem extends PointerActionItem {
  type: PointerActionSubtype.pointerMove;
  duration: number;
  origin: any;
  x: number;
  y: number;
}

// Implementation

export class Actions {
  private sources: {[id: string]: Source} = {};
  private actionsByTick: Action[][] = [];

  constructor(
    private payload: ActionSequence[],
  ) { }

  public process() {
    for (const sequence of this.payload) {
      const source = new Source(sequence);
      if (sequence.id in this.sources) {
        if (!this.sources[sequence.id].equals(source)) {
          throw new Error("invalid argument");
        }
      } else {
        this.sources[sequence.id] = source;
      }
      let i = 0;
      for (const actionItem of sequence.actions) {
        if (i === this.actionsByTick.length) {
          this.actionsByTick.push([]);
        }
        this.actionsByTick[i].push(new Action(sequence.id, actionItem));
        i++;
      }
    }
  }

  public async dispatch(page: Page) {
    for (const actions of this.actionsByTick) {
      const promises: Array<Promise<void|void[]>> = [];
      for (const action of actions) {
        promises.push(action.perform(this.sources[action.id], page));
      }
      await Promise.all(promises);
    }
  }
}

class Source {
  public type: SourceType;
  public id: string;
  public parameters?: SourceParameters;

  constructor(actionSequence: ActionSequence) {
    this.type = actionSequence.type;
    this.id = actionSequence.id;
    if (actionSequence.parameters) {
      this.parameters = actionSequence.parameters;
      if (this.parameters.pointerType !== PointerType.mouse) {
        throw new Error("Only mouse pointer is supported.");
      }
    }
  }

  public equals(that: Source): boolean {
    if (this.type !== that.type || this.id !== that.id) {
      return false;
    }
    if (this.parameters) {
      return that.parameters !== undefined &&
        (this.parameters.pointerType === that.parameters.pointerType);
    } else {
      return that.parameters === undefined;
    }
  }
}

enum ButtonName {
  left = "left",
  middle = "middle",
  right = "right",
}

const BUTTON_ID_TO_NAME: {[id: string]: ButtonName} = {
  0: ButtonName.left,
  1: ButtonName.middle,
  2: ButtonName.right,
};

class Action {
  constructor(
    public id: string,
    public actionItem: ActionItem,
  ) { }

  public perform(source: Source, page: Page): Promise<void|void[]> {
    if (source.type === SourceType.none || this.actionItem.type === NullActionSubtype.pause) {
      return this.performPauseAction(page);
    }
    if (source.type === SourceType.key) {
      return this.performKeyAction(page);
    }
    // (source.type === SourceType.pointer)
    return this.performPointerAction(page);
  }

  private performPauseAction(page: Page): Promise<void> {
    const item = this.actionItem as NullActionItem | PointerMoveActionItem;
    return new Promise((resolve) => {
      setTimeout(() => {resolve(); }, item.duration);
    });
  }

  private performKeyAction(page: Page): Promise<void>  {
    const item = this.actionItem as KeyActionItem;
    if (item.type === KeyActionSubtype.keyDown) {
      return page.keyboard.down(item.value);
    } else {
      return page.keyboard.up(item.value);
    }
  }

  private performPointerAction(page: Page): Promise<void|void[]>  {
    if (this.actionItem.type === PointerActionSubtype.pointerCancel) {
      return new Promise((resolve, reject) => {reject("pointerCancel unsupported"); });
    }
    if (this.actionItem.type === PointerActionSubtype.pointerMove) {
      const i = this.actionItem as PointerMoveActionItem;
      return Promise.all([
        page.mouse.move(i.x, i.y),
        this.performPauseAction(page),
      ]);
    }
    const item = this.actionItem as PointerUpDownActionItem;
    const buttonID = item.button;
    if (!(buttonID in BUTTON_ID_TO_NAME)) {
      return new Promise((resolve, reject) => {reject("unsupported button"); });
    }
    if (item.type === PointerActionSubtype.pointerDown) {
      return page.mouse.down({button: BUTTON_ID_TO_NAME[buttonID]});
    }
    // (item.type === PointerActionSubtype.pointerUp)
    return page.mouse.up({button: BUTTON_ID_TO_NAME[buttonID]});
  }
}
