# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.28](https://github.com/bacali95/typesafe-rpc/compare/v0.0.27...v0.0.28) (2026-02-11)


### Features

* integrate Zod for parameter validation in Route class and enhance error responses ([4ddc249](https://github.com/bacali95/typesafe-rpc/commit/4ddc249a80ff4ec5e9812e5b763e455922f534cc))

### [0.0.27](https://github.com/bacali95/typesafe-rpc/compare/v0.0.26...v0.0.27) (2026-02-05)


### Bug Fixes

* include response headers in the Response object thrown in fetchData function for improved error handling ([55762ce](https://github.com/bacali95/typesafe-rpc/commit/55762ce342fc4dd4cbdf5ed22bd3622b4d0c95b6))

### [0.0.26](https://github.com/bacali95/typesafe-rpc/compare/v0.0.25...v0.0.26) (2026-02-04)


### Bug Fixes

* improve error handling in fetchData function to differentiate between FetchError and Response based on environment ([9c564c9](https://github.com/bacali95/typesafe-rpc/commit/9c564c988a267ffa5d4ffa7bbf6f5851a75da016))

### [0.0.25](https://github.com/bacali95/typesafe-rpc/compare/v0.0.24...v0.0.25) (2026-02-04)


### Bug Fixes

* allow optional context parameter in headers function for createRpcClient ([17d9841](https://github.com/bacali95/typesafe-rpc/commit/17d9841b68293b93a32eef5652fb5990702ac715))

### [0.0.24](https://github.com/bacali95/typesafe-rpc/compare/v0.0.23...v0.0.24) (2026-02-04)


### Bug Fixes

* set default value for Context parameter in createRpcClient function ([f6f1c9e](https://github.com/bacali95/typesafe-rpc/commit/f6f1c9ebc19eabca0924a9e69ff481ff6cf2b197))

### [0.0.23](https://github.com/bacali95/typesafe-rpc/compare/v0.0.22...v0.0.23) (2026-02-04)


### Features

* enhance createRpcClient to support context parameter for dynamic headers ([ae8a8d2](https://github.com/bacali95/typesafe-rpc/commit/ae8a8d289c7857aeb79e34aa8ce66627b5a0419d))

### [0.0.22](https://github.com/bacali95/typesafe-rpc/compare/v0.0.21...v0.0.22) (2026-02-03)

### [0.0.21](https://github.com/bacali95/typesafe-rpc/compare/v0.0.20...v0.0.21) (2026-02-03)

### [0.0.20](https://github.com/bacali95/typesafe-rpc/compare/v0.0.19...v0.0.20) (2026-02-03)

### [0.0.19](https://github.com/bacali95/typesafe-rpc/compare/v0.0.18...v0.0.19) (2026-02-03)


### Bug Fixes

* update FetchError to include additional data in error handling and improve error message parsing in fetchData ([3945379](https://github.com/bacali95/typesafe-rpc/commit/3945379473f4eeb365f501e19fc60f67fa3b45bc))

### [0.0.18](https://github.com/bacali95/typesafe-rpc/compare/v0.0.17...v0.0.18) (2026-02-02)


### Features

* add typesafe-rpc documentation with overview, core types, server and client usage, and conventions ([9dec3ae](https://github.com/bacali95/typesafe-rpc/commit/9dec3aed3b896f5f77698aa67b8dcab653955231))


### Bug Fixes

* enhance FetchError handling to include error key and improve error message parsing in fetchData ([cb4162b](https://github.com/bacali95/typesafe-rpc/commit/cb4162b45f2daaf06713d8cd68b1202a361f7ce6))

### [0.0.17](https://github.com/bacali95/typesafe-rpc/compare/v0.0.16...v0.0.17) (2025-12-31)


### Bug Fixes

* make headers parameter optional in createRpcClient function ([1108575](https://github.com/bacali95/typesafe-rpc/commit/1108575b331da9afccf7cec6ba751c8521039cf1))

### [0.0.16](https://github.com/bacali95/typesafe-rpc/compare/v0.0.15...v0.0.16) (2025-12-31)


### Features

* update fetchData and createRpcClient to accept headers and improve request handling ([001c05b](https://github.com/bacali95/typesafe-rpc/commit/001c05b6c6de16dbb056415d1365a9552ffcc04c))

### [0.0.15](https://github.com/bacali95/typesafe-rpc/compare/v0.0.14...v0.0.15) (2025-12-14)

### [0.0.14](https://github.com/bacali95/typesafe-rpc/compare/v0.0.13...v0.0.14) (2025-12-14)

### [0.0.13](https://github.com/bacali95/typesafe-rpc/compare/v0.0.12...v0.0.13) (2025-12-14)

### [0.0.12](https://github.com/bacali95/typesafe-rpc/compare/v0.0.11...v0.0.12) (2025-12-14)

### [0.0.11](https://github.com/bacali95/typesafe-rpc/compare/v0.0.10...v0.0.11) (2025-12-14)

### [0.0.10](https://github.com/bacali95/typesafe-rpc/compare/v0.0.9...v0.0.10) (2025-12-14)

### [0.0.9](https://github.com/bacali95/typesafe-rpc/compare/v0.0.8...v0.0.9) (2025-12-14)

### [0.0.8](https://github.com/bacali95/typesafe-rpc/compare/v0.0.7...v0.0.8) (2025-08-17)

### [0.0.7](https://github.com/bacali95/typesafe-rpc/compare/v0.0.6...v0.0.7) (2025-08-15)


### Features

* enhance hook arguments in createRpcHandler for improved type safety ([3eb320d](https://github.com/bacali95/typesafe-rpc/commit/3eb320de87cdc98ca1548e4eb458946588153c91))

### [0.0.6](https://github.com/bacali95/typesafe-rpc/compare/v0.0.5...v0.0.6) (2025-08-14)


### Features

* add route handling and middleware enhancements ([fe27541](https://github.com/bacali95/typesafe-rpc/commit/fe275412cd6bba10895f5fcf135045930816026e))

### [0.0.5](https://github.com/bacali95/typesafe-rpc/compare/v0.0.4...v0.0.5) (2025-08-14)

### [0.0.4](https://github.com/bacali95/typesafe-rpc/compare/v0.0.3...v0.0.4) (2025-08-14)

### [0.0.3](https://github.com/bacali95/typesafe-rpc/compare/v0.0.2...v0.0.3) (2025-08-14)

### [0.0.2](https://github.com/bacali95/typesafe-rpc/compare/v0.0.1...v0.0.2) (2025-08-14)

### 0.0.1 (2025-08-14)


### Features

* implement basic features ([3327d51](https://github.com/bacali95/typesafe-rpc/commit/3327d510c840d9b0ba4c3e63687109df8b7a6e1e))
