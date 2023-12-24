import { BunchIDs, BunchMeta, List, Order, Position } from "list-positions";
import { Anchor, Formatting } from "./formatting";
import { anchorsFromSlice, diffFormats } from "./helpers";

export type Span = {
  start: Anchor;
  end: Anchor;
  key: string;
  /** Anything except null - that's reserved to mean "delete this format". */
  value: any;
  creatorID: string;
  /** Lamport timestamp. Ties broken by creatorID. Always positive. */
  timestamp: number;
};

export class RichList<T> {
  readonly order: Order;
  readonly list: List<T>;
  readonly formatting: Formatting<Span>;

  readonly replicaID: string;
  private timestamp = 0;

  private readonly expandRules?: (
    key: string,
    value: any
  ) => "after" | "before" | "none" | "both";

  onCreateSpan: ((createdSpan: Span) => void) | undefined = undefined;

  constructor(options?: {
    // TODO: also accept list as arg?
    order?: Order; // If not provided, all are "after".
    replicaID?: string;
    expandRules?: (
      key: string,
      value: any
    ) => "after" | "before" | "none" | "both";
  }) {
    this.order = options?.order ?? new Order();
    this.list = new List(this.order);
    this.formatting = new Formatting(this.order, RichList.compareSpans);
    this.replicaID = options?.replicaID ?? BunchIDs.newReplicaID();
    this.expandRules = options?.expandRules;
  }

  static compareSpans = (a: Span, b: Span): number => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.creatorID === b.creatorID) return 0;
    return a.creatorID > b.creatorID ? 1 : -1;
  };

  insertAt(
    index: number,
    format: Record<string, any>,
    value: T
  ): [pos: Position, createdBunch: BunchMeta | null, createdSpans: Span[]];
  insertAt(
    index: number,
    format: Record<string, any>,
    ...values: T[]
  ): [startPos: Position, createdBunch: BunchMeta | null, createdSpans: Span[]];
  insertAt(
    index: number,
    format: Record<string, any>,
    ...values: T[]
  ): [
    startPos: Position,
    createdBunch: BunchMeta | null,
    createdSpans: Span[]
  ] {
    const [startPos, createdBunch] = this.list.insertAt(index, ...values);
    // Inserted positions all get the same initial format because they are not
    // interleaved with any existing positios.
    const needsFormat = diffFormats(
      this.formatting.getFormat(startPos),
      format
    );
    const createdSpans: Span[] = [];
    for (const [key, value] of needsFormat) {
      const expand =
        this.expandRules === undefined ? "after" : this.expandRules(key, value);
      const { start, end } = anchorsFromSlice(
        this.list,
        index,
        index + values.length,
        expand
      );
      const span: Span = {
        start,
        end,
        key,
        value,
        timestamp: ++this.timestamp,
        creatorID: this.replicaID,
      };
      this.formatting.addSpan(span);
      this.onCreateSpan?.(span);
      createdSpans.push(span);
    }

    return [startPos, createdBunch, createdSpans];
  }

  // TODO: matchFormat wrapper for later set/setAt? One that actually adds the spans.

  format(
    startIndex: number,
    endIndex: number,
    key: string,
    value: any,
    expand: "after" | "before" | "none" | "both" = "after"
  ): Span {
    if (startIndex <= endIndex) {
      throw new Error(`startIndex <= endIndex: ${startIndex}, ${endIndex}`);
    }

    let start: Anchor;
    if (expand === "before" || expand === "both") {
      const pos =
        startIndex === 0
          ? Order.MIN_POSITION
          : this.list.positionAt(startIndex - 1);
      start = { pos, before: false };
    } else {
      start = { pos: this.list.positionAt(startIndex), before: true };
    }
    let end: Anchor;
    if (expand === "after" || expand === "both") {
      const pos =
        endIndex === this.list.length
          ? Order.MAX_POSITION
          : this.list.positionAt(endIndex);
      end = { pos, before: true };
    } else {
      end = { pos: this.list.positionAt(endIndex - 1), before: false };
    }

    const span: Span = {
      start,
      end,
      key,
      value,
      timestamp: ++this.timestamp,
      creatorID: this.replicaID,
    };
    this.formatting.addSpan(span);
    this.onCreateSpan?.(span);
    return span;
  }

  // Other ops only involve one of (list, formatting); do it directly on them?
}
