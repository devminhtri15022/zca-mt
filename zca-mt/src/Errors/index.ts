export * from "./ZaloApiError.js";
export * from "./ZaloApiMissingImageMetadataGetter.js";
export * from "./ZaloApiLoginQRAborted.js";
export * from "./ZaloApiLoginQRDeclined.js";

// ZCA-MT error hierarchy (additive; does not replace the errors above,
// which are preserved from the original zca-js project for compatibility).
export * from "./ZcaMTError.js";
export * from "./AuthenticationError.js";
export * from "./SessionError.js";
export * from "./NetworkError.js";
export * from "./ApiError.js";
export * from "./ListenerError.js";
export * from "./ValidationError.js";
export * from "./RateLimitError.js";
