CREATE SCHEMA IF NOT EXISTS raw_corn;
CREATE SCHEMA IF NOT EXISTS raw_sedad;

CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS analytics;

COMMENT ON SCHEMA raw_corn IS
'Isolated raw data from BMI Bank Corn simulator';

COMMENT ON SCHEMA raw_sedad IS
'Isolated raw data from SEDAD simulator';

COMMENT ON SCHEMA staging IS
'Validated and standardized data';

COMMENT ON SCHEMA analytics IS
'Business intelligence and analytical models';
