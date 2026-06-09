-- 管理员可查看的明文密码备份（与 bcrypt password 同步更新；旧账号为 NULL 需重置后可见）
ALTER TABLE users
  ADD COLUMN password_plain VARCHAR(128) NULL COMMENT '明文密码备份（仅管理员查看）' AFTER password;
