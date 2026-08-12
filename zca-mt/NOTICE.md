# NOTICE

ZCA-MT is a fork of, and is developed from, the open-source project
[zca-js](https://github.com/RFS-ADRENO/zca-js) by RFS-ADRENO and
contributors (truong9c2208, JustKemForFun).

The original project is licensed under the MIT License:

```
Copyright (c) 2024 - 2025 RFS-ADRENO, truong9c2208, JustKemForFun
```

The full, unmodified original license text is preserved in [`LICENSE`](./LICENSE)
in this repository, as required by the MIT License.

## What changed in this fork

ZCA-MT keeps the vast majority of `zca-js`'s source code (the API request
layer under `src/apis/`, the models, the realtime listener, and the core
login flow) unchanged in behavior. On top of that, this fork adds:

- A `ZcaMT` class (an unmodified subclass of the original `Zalo` class) as
  the preferred entry point, with `Zalo` kept as a compatibility alias.
- An additional error hierarchy (`ZcaMTError`, `AuthenticationError`,
  `SessionError`, `NetworkError`, `ApiError`, `ListenerError`,
  `ValidationError`, `RateLimitError`) alongside the original error classes.
- Logger redaction for sensitive fields (cookie, token, imei, secret,
  authorization, session).
- Optional, non-automatic session save/load helpers with restrictive file
  permissions.
- An optional client-side rate limiter and an optional
  `imageMetadataGetter` validation wrapper.
- Rebranded package metadata, README, examples, and test suite.

**ZCA-MT does not claim authorship of the original `zca-js` source code.**
All credit for the reverse-engineering and implementation of the underlying
Zalo Web protocol belongs to the original authors.

## License of ZCA-MT's own additions

The additions listed above, written for this fork, are also released under
the MIT License, consistent with the license of the upstream project. See
[`LICENSE`](./LICENSE).
