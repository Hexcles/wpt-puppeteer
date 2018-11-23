export interface ActionSequence {
  type: SourceType;
  id: string;
  actions: ActionItem[];
}

interface NullActionSequence extends ActionSequence {
  type: SourceType.none;
}

interface KeyActionSequence extends ActionSequence {
  type: SourceType.key;
}

interface PointerActionSequence extends ActionSequence {
  type: SourceType.pointer;
  parameters?: {
    pointerType: PointerType
  };
}

enum SourceType {
  pointer = "pointer",
  key = "key",
  none = "none"
}

enum PointerType {
  mouse = "mouse",
  pen = "pen",
  touch = "touch"
}

interface ActionItem {
  type: NullActionSubtype | KeyActionSubtype | PointerActionSubtype
}

enum NullActionSubtype {
  pause = "pause"
}

enum KeyActionSubtype {
  keyDown = "keyDown",
  keyUp = "keyUp"
}

enum PointerActionSubtype {
  pointerDown = "pointerDown",
  pointerUp = "pointerUp",
  pointerMove = "pointerMove",
  pointerCancel = "pointerCancel"
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

export class Actions {
  private sources: {[id: string]: string} = {};

  constructor(
    private payload: ActionSequence[]
  ) { }

  public process() {

  }
}

class Action {

}
