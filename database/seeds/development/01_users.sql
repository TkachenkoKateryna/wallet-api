-- 4 customers. IDs: a0000000-0000-0000-0000-0000000000NN
-- 01 is unused: it belonged to the old system user. System accounts now have no owner.

INSERT INTO users (id, email, name, phone) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'olena.kovalenko@example.com', 'Olena Kovalenko', '+380501112233'),
    ('a0000000-0000-0000-0000-000000000003', 'mark.johnson@example.com',    'Mark Johnson',    '+14155550123'),
    ('a0000000-0000-0000-0000-000000000004', 'sofia.marchenko@example.com', 'Sofia Marchenko', NULL),
    ('a0000000-0000-0000-0000-000000000005', 'taras.shevchuk@example.com',  'Taras Shevchuk',  '+380671234567');
