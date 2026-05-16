-- 用户头像字段（存量库执行一次）
ALTER TABLE `users`
  ADD COLUMN `avatar` VARCHAR(512) NULL COMMENT '头像相对路径（如 avatars/xxx.jpg）' AFTER `department`;
