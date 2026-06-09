-- 统一种子账号密码哈希（bcryptjs，与生产环境一致；幂等，可重复执行）
-- admin / admin123
-- teacher、student / 123456

UPDATE `users`
SET `password` = '$2a$10$Z9fxLg22Vv//etmNbIllruT6WT0NtsIZTyi7iXD.ezYbDqIOZM0GG'
WHERE `role` = 'admin';

UPDATE `users`
SET `password` = '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2'
WHERE `role` IN ('teacher', 'student', 'enterprise');
