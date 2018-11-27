import { Page } from "puppeteer";

import { Logger } from "./util";
const logger = new Logger("wptrun.actions");

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
  duration?: number;
  x: number;
  y: number;
  origin?: string;
}

// Implementation

export class Actions {
  private sources: {[id: string]: Source} = {};
  private actionsByTick: Action[][] = [];

  constructor(
    private payload: ActionSequence[],
  ) {
    logger.debug("Raw payload:", JSON.stringify(payload));
  }

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
    logger.debug(this.sources);
    logger.debug(this.actionsByTick);
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

// This function is executed in browser context.
function get_center_point(elem: Element): {x: number, y: number} {
    const min = (a: number, b: number) => a < b ? a : b;
    const max = (a: number, b: number) => a > b ? a : b;

    const rect = elem.getClientRects()[0];
    if (rect === undefined) {
      return {x: -1, y: -1};
    }
    const left = max(0, rect.left);
    const right = min(window.innerWidth, rect.right);
    const top = max(0, rect.top);
    const bottom = min(window.innerHeight, rect.bottom);
    return {
        x: Math.floor((left + right) / 2),
        y: Math.floor((top + bottom) / 2),
    };
}

class Action {
  private static inViewport(page: Page, pos: {x: number, y: number}): boolean {
    const viewport = page.viewport();
    return ((pos.x >= 0 && pos.x <= viewport.width) &&
            (pos.y >= 0 && pos.y <= viewport.height));
  }

  constructor(
    public id: string,
    public actionItem: ActionItem,
  ) { }

  public perform(source: Source, page: Page): Promise<void|void[]> {
    logger.debug("Performing", this.actionItem);
    if (source.type === SourceType.none || this.actionItem.type === NullActionSubtype.pause) {
      return this.performNullAction(page);
    }
    if (source.type === SourceType.key) {
      return this.performKeyAction(page);
    }
    // (source.type === SourceType.pointer)
    return this.performPointerAction(page);
  }

  private performPauseAction(page: Page, duration: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }

  private performNullAction(page: Page): Promise<void> {
    const item = this.actionItem as NullActionItem;
    return this.performPauseAction(page, item.duration);
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
      return new Promise((resolve, reject) => reject("pointerCancel unsupported"));
    }

    if (this.actionItem.type === PointerActionSubtype.pointerMove) {
      return this.performPointerMoveAction(page);
    }

    const item = this.actionItem as PointerUpDownActionItem;
    const buttonID = item.button;
    if (!(buttonID in BUTTON_ID_TO_NAME)) {
      return new Promise((resolve, reject) => reject("unsupported button"));
    }
    if (item.type === PointerActionSubtype.pointerDown) {
      return page.mouse.down({button: BUTTON_ID_TO_NAME[buttonID]});
    }
    // (item.type === PointerActionSubtype.pointerUp)
    return page.mouse.up({button: BUTTON_ID_TO_NAME[buttonID]});
  }

  private performPointerMoveAction(page: Page): Promise<void|void[]> {
    const item = this.actionItem as PointerMoveActionItem;
    const promises = [];
    let getOrigin: Promise<{x: number, y: number}>;

    if (item.origin === "pointer") {
      return new Promise((resolve, reject) => reject("pointer origin unsupported"));
    }
    if (item.origin && item.origin !== "viewport") {
      getOrigin = page.$eval(item.origin, get_center_point);
    } else {
      getOrigin = new Promise((resolve) => resolve({x: 0, y: 0}));
    }

    promises.push(getOrigin.then((origin) => {
      const target = {x: origin.x + item.x, y: origin.y + item.y};
      if (!Action.inViewport(page, origin) || !Action.inViewport(page, target)) {
        throw new Error("move target out of bounds");
      }
      return page.mouse.move(target.x, target.y);
    }));

    if (item.duration) {
      promises.push(this.performPauseAction(page, item.duration));
    }
    return Promise.all(promises);
  }
}
