-- Migration V14: khóa liên kết ổn định từ các biểu mẫu sang dan_cu.
-- Chạy idempotent; không tự ghép dữ liệu cũ theo tên/mã hộ.

DO $$
DECLARE
    item RECORD;
    constraint_name TEXT;
    index_name TEXT;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('table_1','dan_cu_me_id'), ('table_1','dan_cu_con_id'),
            ('table_2','dan_cu_tre_id'), ('table_2','dan_cu_me_id'),
            ('table_3','dan_cu_id'), ('table_4','dan_cu_id'),
            ('table_5','dan_cu_id'), ('table_6','dan_cu_id'),
            ('table_7','dan_cu_id'), ('table_8','dan_cu_id'),
            ('table_9','dan_cu_id'), ('table_10','dan_cu_id'),
            ('table_11','dan_cu_id')
        ) AS links(table_name, column_name)
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I BIGINT', item.table_name, item.column_name);

        -- Chỉ bỏ ID tham chiếu không còn tồn tại; giữ nguyên mọi dữ liệu báo cáo.
        EXECUTE format(
            'UPDATE %I AS r SET %I = NULL WHERE r.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dan_cu d WHERE d.id = r.%I)',
            item.table_name, item.column_name, item.column_name, item.column_name
        );

        constraint_name := 'fk_' || item.table_name || '_' || item.column_name;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = constraint_name
              AND conrelid = to_regclass(item.table_name)
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES dan_cu(id) ON DELETE SET NULL',
                item.table_name, constraint_name, item.column_name
            );
        END IF;

        index_name := 'idx_' || item.table_name || '_' || item.column_name;
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I (%I) WHERE %I IS NOT NULL',
            index_name, item.table_name, item.column_name, item.column_name
        );
    END LOOP;
END $$;

-- Bảng 6: một người chính nằm ở table_6.dan_cu_id; các thành viên đi cùng
-- khi tách hộ được lưu ở bảng liên kết phụ có khóa ngoại thật đến hai bảng.
CREATE TABLE IF NOT EXISTS table_6_thanh_vien (
    id BIGSERIAL PRIMARY KEY,
    table_6_id INTEGER NOT NULL REFERENCES table_6(id) ON DELETE CASCADE,
    dan_cu_id BIGINT REFERENCES dan_cu(id) ON DELETE SET NULL,
    vai_tro TEXT NOT NULL DEFAULT 'THANH_VIEN_TACH_CUNG',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (table_6_id, dan_cu_id)
);
CREATE INDEX IF NOT EXISTS idx_table_6_thanh_vien_dan_cu
    ON table_6_thanh_vien (dan_cu_id) WHERE dan_cu_id IS NOT NULL;
