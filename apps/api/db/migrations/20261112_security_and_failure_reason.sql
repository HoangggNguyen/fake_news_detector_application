-- Chạy MỘT LẦN trên database đã tạo trước ngày 12/11/2026 (database mới từ init.sql không cần).
-- 1. Bỏ cột lưu mật khẩu nguyên văn. Đăng nhập chỉ dùng password_hash (scrypt).
ALTER TABLE users DROP COLUMN real_pass;

-- 2. Lưu lý do thất bại (đã viết cho người dùng) để mở lại cuộc trò chuyện vẫn thấy nguyên nhân.
ALTER TABLE analyses ADD COLUMN error_message VARCHAR(500) NULL AFTER status;

-- 3. content_hash được tính nhưng không dùng ở đâu.
ALTER TABLE analyses DROP INDEX analyses_content_hash, DROP COLUMN content_hash;
