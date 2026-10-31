import type {
  FileProcessor,
  ProcessingContext,
  ProcessingRequest,
  ProcessingResult,
} from "@gsft/shared";

export class ProcessorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessorUnavailableError";
  }
}

export class ProcessingRouter {
  constructor(private readonly processors: readonly FileProcessor[]) {}

  getCapabilities() {
    return this.processors.map((processor) => processor.capability);
  }

  async process(
    request: ProcessingRequest,
    context: ProcessingContext,
  ): Promise<ProcessingResult> {
    const compatible = this.processors.filter(
      ({ capability }) =>
        capability.category === request.category &&
        capability.operations.includes(request.operation) &&
        (!request.requestedLocation || capability.location === request.requestedLocation),
    );
    const processor = compatible.find(({ capability }) => capability.available);

    if (!processor) {
      const locationLabel = request.requestedLocation
        ? ` at ${request.requestedLocation}`
        : "";
      const reason = compatible.find(({ capability }) => !capability.available)?.capability
        .unavailableReason;
      throw new ProcessorUnavailableError(
        reason ??
          `No available processor supports ${request.operation}${locationLabel}.`,
      );
    }

    if (context.signal.aborted) {
      throw new DOMException("Cancelled", "AbortError");
    }

    const result = await processor.process(request, context);
    if (result.requestId !== request.id) {
      throw new Error("The processor returned a result for a different request.");
    }
    if (result.location !== processor.capability.location) {
      throw new Error("The processor returned an unexpected processing location.");
    }
    if (result.output.data.size === 0) {
      throw new Error("The processor returned an empty output file.");
    }
    if (!result.output.name.trim()) {
      throw new Error("The processor returned an output without a file name.");
    }
    if (result.statistics.inputBytes !== request.input.data.size) {
      throw new Error("The processor returned inconsistent input size information.");
    }
    if (result.statistics.outputBytes !== result.output.data.size) {
      throw new Error("The processor returned inconsistent output size information.");
    }
    if (!Number.isFinite(result.statistics.durationMs) || result.statistics.durationMs < 0) {
      throw new Error("The processor returned invalid processing duration information.");
    }

    return result;
  }
}
