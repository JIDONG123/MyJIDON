-- 用户头像字段（存量库；幂等）
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `avatar` VARCHAR(512) NULL COMMENT '头像相对路径（如 avatars/xxx.jpg）' AFTER `department`;
