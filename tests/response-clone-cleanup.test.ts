import { describe, expect, it } from "vite-plus/test";
import { _finalizeResponseBody } from "../packages/vinext/src/shims/fetch-cache.js";

// Ported from Next.js: test/unit/clone-response.test.ts
// https://github.com/vercel/next.js/blob/canary/test/unit/clone-response.test.ts
describe("unused response clone cleanup", () => {
  it("handles cleanup failure after the consumer catches a body error", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const original = new Response(
        new ReadableStream({
          start(value) {
            controller = value;
          },
        }),
      );
      const [consumedBody, unusedBody] = original.body!.tee();
      const consumed = new Response(consumedBody);
      const unused = new Response(unusedBody);
      const read = consumed.json();
      const error = new TypeError("terminated");

      controller.error(error);
      await expect(read).rejects.toBe(error);
      expect(unused.body!.locked).toBe(false);

      // The FinalizationRegistry runs this when the unused clone is collected.
      _finalizeResponseBody(new WeakRef(unused.body!));

      // An ignored cancellation rejection is reported on the next event-loop turn.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
