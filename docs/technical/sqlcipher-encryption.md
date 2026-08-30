# SQLCipher 加密（移动端 SQLite）设计

> Status: 设计稿（planned，未实现）。SQLCipher 数据库迁移仍需单独验证；本项目当前先确保
> API/登录凭据不落入普通设置快照。
> 前置依赖：[关键决策 #4](./key-decisions.md) 与结构化迁移框架（`src/renderer/storage/sqliteMigrations.ts`）。

## 现状

- 移动端会话/设置存储由 SQLite 管理；SQLCipher 静态加密尚未在本设计之外落地。
- `@capacitor-community/sqlite` 在 Android 上底层使用 SQLCipher，加密能力已内置，只是未启用密钥。
- API 凭据通过 Android Keystore 的 AES-GCM 加密保存（`SecureStoragePlugin`）。插件不可用时，
  凭据只保留在当前 WebView 进程内存，不会回退到 `chatbox-credentials.db` 或其他明文存储。

## 目标

为 `chatbox.db` 启用 SQLCipher 静态加密，使消息内容与设置快照在磁盘上以密文形式存在；
密钥本身由 Android Keystore 保护，不进入 SQLite 文件。

## 密钥管理设计

1. 首次启动生成 32 字节随机 passphrase（Base64 编码）。
2. 将 passphrase 存入 `SecureStoragePlugin`（Android Keystore 背书的 AES-GCM 加密），
   使用保留 key，例如 `sqlcipher.passphrase`。
3. 打开数据库时读取 passphrase，以 `createConnection(db, true, 'secret', version, false)`
   传入；插件内部以该 passphrase 对 SQLCipher 加解密。
4. 不采用插件自带的 `setEncryptionSecret` 全局密钥存储，避免与现有 `SecureStoragePlugin`
   出现两套密钥来源；如后续引入更多加密库，再评估切换为插件原生 secret store。

## 明文 → 加密迁移

迁移必须一次性、可回滚，且能在旧版本 app 覆盖安装后安全执行：

1. 检测当前库是否已加密（`isDatabaseEncrypted` / 打开失败判定）。
2. 若为明文：
   - 用 `no-encryption` 打开，读取并缓存 `PRAGMA user_version` 与表清单；
   - 生成 passphrase，写入 `SecureStoragePlugin`；
   - 使用 SQLCipher 的 `sqlcipher_export`（或插件 `changeEncryptionSecret` 流程）把
     明文库复制为加密库；
   - 校验导出后 `user_version`、表清单与行数一致；
   - 原子替换原库文件、删除明文残留，并 `PRAGMA secure_delete=ON` 降低明文恢复风险。
3. 若已加密：直接读取 passphrase 打开。
4. 迁移失败时回滚到明文库并保留原始文件备份（`.bak`），下次启动重试或降级为明文并记录日志。

> 具体 API 以 `@capacitor-community/sqlite` 当前版本的加密升级文档为准；Android 的
> 加密升级通常走 `addSQLiteSuffix` + `getMigratableDbList` + 逐库 `changeEncryptionSecret`
> 或 `sqlcipher_export` 两条路线，需在真机验证后二选一固化。

## 风险与验证门禁

- 性能：SQLCipher 有加解密开销，需在低端设备上做启动与读写基准。
- 密钥丢失：Keystore 密钥随卸载/系统备份策略可能丢失，需明确「卸载即丢数据」的预期，
  并确保备份导出仍走现有脱敏路径（绝不导出 passphrase）。
- 迁移原子性：跨版本覆盖安装时迁移必须在首次打开前完成，避免读到半迁移库。

验证清单（合入前必须完成）：

- [ ] 具备 JDK 21 + Android SDK，`./gradlew assembleDebug` 通过。
- [ ] 真机/模拟器：全新安装 → 加密建库，`PRAGMA key` 生效，文件内容非明文。
- [ ] 覆盖安装明文旧版本 → 自动迁移 → 数据完整、可读。
- [ ] 覆盖安装加密旧版本 → 用同一 passphrase 打开。
- [ ] 备份导出仍脱敏、不含 passphrase；恢复后可读。

## 相关实现

- `src/renderer/storage/sqliteConnection.ts`：建库入口（当前 `no-encryption`）。
- `src/renderer/storage/sqliteMigrations.ts`：版本化 schema 迁移（加密迁移的前置）。
- `android/.../SecureStoragePlugin.java`：Android Keystore AES-GCM，passphrase 的存放处。
