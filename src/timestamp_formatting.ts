import { BunchIDs, Order } from "list-positions";
import { Anchor, FormatChange, Formatting } from "./formatting";

export type TimestampMark = {
  start: Anchor;
  end: Anchor;
  key: string;
  /** Anything except null - that's reserved to mean "delete this format". */
  value: any;
  creatorID: string;
  /** Lamport timestamp. Ties broken by creatorID. Always positive. */
  timestamp: number;
};

export function compareTimestampMarks(
  a: TimestampMark,
  b: TimestampMark
): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.creatorID === b.creatorID) return 0;
  return a.creatorID > b.creatorID ? 1 : -1;
}

export class TimestampFormatting extends Formatting<TimestampMark> {
  readonly replicaID: string;
  private timestamp = 0;

  constructor(order: Order, options?: { replicaID?: string }) {
    super(order, compareTimestampMarks);

    this.replicaID = options?.replicaID ?? BunchIDs.newReplicaID();
  }

  /**
   * Creates a new TimestampMark without adding it.
   *
   * It is greater than all known marks and uses our replicaID.
   *
   * @param start
   * @param end
   * @param key
   * @param value
   */
  newMark(start: Anchor, end: Anchor, key: string, value: any): TimestampMark {
    return {
      start,
      end,
      key,
      value,
      creatorID: this.replicaID,
      timestamp: ++this.timestamp,
    };
  }

  addMark(mark: TimestampMark): FormatChange[] {
    this.timestamp = Math.max(this.timestamp, mark.timestamp);
    return super.addMark(mark);
  }

  load(savedState: TimestampMark[]): void {
    super.load(savedState);
    if (savedState.length !== 0) {
      // Use the fact that savedState is in order by timestamp.
      this.timestamp = Math.max(
        this.timestamp,
        savedState[savedState.length - 1].timestamp
      );
    }
  }
}
