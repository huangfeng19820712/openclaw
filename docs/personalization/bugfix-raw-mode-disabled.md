# Bug修复: Raw模式禁用问题 (Raw mode disabled)

---

## 问题描述

在 OpenClaw Control UI 的配置页面 (`/config`) 中，显示 "Raw mode disabled (snapshot cannot safely round-trip raw text)" 错误，即使对于全新的实例也是如此。

**受影响版本**: 2026.4.11

**问题路径**:
- UI显示: `http://192.168.90.6:{port}/config`
- 错误信息: "Raw mode disabled (snapshot cannot safely round-trip raw text)."

---

## 根本原因

**问题文件**: `src/config/redact-snapshot.ts`

**问题函数**: `restoreRedactedValuesGuessing`

**详细分析**:

当配置快照进行脱敏处理时，`shouldFallbackToStructuredRawRedaction()` 函数会验证脱敏后的原始文本能否正确还原。

问题出在 `restoreRedactedValuesGuessing` 处理嵌套敏感路径（如 `gateway.auth.token`）时：

1. 在处理 `gateway.auth` 层级时，`value = { token: "__OPENCLAW_REDACTED__", mode: "..." }` (对象)
2. 因为是对象，进入 `typeof value === "object"` 分支
3. 此时检查 `isSensitivePath("gateway.auth")` 返回 false（因为 `auth` 不是敏感路径段）
4. 所以 `canRestoreSecretRef` 为 false，导致递归调用
5. 在下一层级（`gateway.auth.token`）时，`value` 是字符串 `"__OPENCLAW_REDACTED__"`
6. 但此时已经无法正确识别并恢复嵌套的敏感值

**关键代码问题** (修复前):

```typescript
} else if (typeof value === "object" && value !== null) {
  const canRestoreSecretRef =
    !isExplicitlyNonSensitivePath(hints, [path, wildcardPath]) &&
    (isSensitivePath(path) ||
      hasSensitiveUrlHintPath(hints, [path, wildcardPath]) ||
      isSensitiveUrlPath(path));
  if (canRestoreSecretRef) {
    // ... 处理 SecretRef
  } else {
    // 问题在这里: 递归调用时没有处理字符串类型的 REDACTED_SENTINEL
    result[key] = restoreRedactedValuesGuessing(value, orig[key], path, hints);
  }
} else {
  result[key] = value;  // 字符串直接赋值，不做处理
}
```

---

## 修复方案

### 新增辅助函数

```typescript
/**
 * Helper to detect if an object contains REDACTED_SENTINEL at a nested sensitive path.
 * This handles the case where we recurse into an object, but the sentinel value
 * is at a deeper path (e.g., gateway.auth.token) that IS sensitive even though
 * the parent path (gateway.auth) is not.
 */
function findNestedSentinelInObject(
  incoming: Record<string, unknown>,
  original: unknown,
  basePath: string,
  hints?: ConfigUiHints,
): { found: boolean; restored: unknown } {
  if (!incoming || typeof incoming !== "object") {
    return { found: false, restored: undefined };
  }
  for (const [key, value] of Object.entries(incoming)) {
    const path = basePath ? `${basePath}.${key}` : key;
    if (value === REDACTED_SENTINEL && isSensitivePath(path)) {
      // Restore from original using the key directly
      const origRecord = toObjectRecord(original);
      if (key in origRecord) {
        return { found: true, restored: origRecord[key] };
      }
    }
  }
  return { found: false, restored: undefined };
}
```

### 修改 `restoreRedactedValuesGuessing` 函数

在处理对象类型时，递归之前先检查是否有嵌套的敏感 sentinel 值：

```typescript
} else if (typeof value === "object" && value !== null) {
  // Bug fix: When value is an object containing sentinels, check if any nested
  // value is REDACTED_SENTINEL at a sensitive path BEFORE recursing.
  const nestedSentinelSensitive = findNestedSentinelInObject(value, orig[key], path, hints);
  if (nestedSentinelSensitive.found) {
    result[key] = nestedSentinelSensitive.restored;
  } else {
    // ... 原有逻辑
  }
}
```

---

## 影响范围

此修复影响所有使用 Raw 模式编辑配置的实例，特别是在处理嵌套敏感配置值时。

**涉及路径模式**:
- `gateway.auth.token`
- `gateway.auth.password`
- `models.providers.*.apiKey`
- 以及其他任何嵌套的敏感配置路径

---

## 验证方法

1. 部署修复后的镜像
2. 访问任意实例的 `/config` 页面
3. 确认 "Raw mode disabled" 错误不再显示
4. 尝试编辑并保存配置，确认凭证（如 token、apiKey）能正确保留

---

## 修改文件

- `src/config/redact-snapshot.ts`
  - 新增: `findNestedSentinelInObject()` 辅助函数
  - 修改: `restoreRedactedValuesGuessing()` 函数中的对象处理逻辑

---

## 相关代码

**敏感路径检测** (`isSensitiveConfigPath`):
```typescript
const SENSITIVE_PATTERNS = [
  /token$/i,
  /password/i,
  /secret/i,
  /api.?key/i,
  /encrypt.?key/i,
  /private.?key/i,
  /serviceaccount(?:ref)?$/i,
];
```

**REDACTED_SENTINEL**:
```typescript
export const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";
```

---

## 修复日期

2026-04-14

## 修复人

Claude (自动修复)
