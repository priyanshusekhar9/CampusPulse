
USE CampusPulse;
GO

-- 1. Add optional seat capacity to existing events.
-- NULL means unlimited seats.
IF COL_LENGTH('dbo.Events', 'capacity') IS NULL
BEGIN
    ALTER TABLE dbo.Events
    ADD capacity INT NULL;
END;
GO

-- 2. Ensure any supplied capacity must be positive.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_Events_Capacity_Positive'
      AND parent_object_id = OBJECT_ID('dbo.Events')
)
BEGIN
    ALTER TABLE dbo.Events
    ADD CONSTRAINT CK_Events_Capacity_Positive
    CHECK (capacity IS NULL OR capacity > 0);
END;
GO

-- 3. Add an index to speed up event attendee lookups.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_EventRegistrations_EventId'
      AND object_id = OBJECT_ID('dbo.EventRegistrations')
)
BEGIN
    CREATE INDEX IX_EventRegistrations_EventId
    ON dbo.EventRegistrations(event_id);
END;
GO

-- 4. Verify existing data and the new column.
SELECT id, title, capacity
FROM dbo.Events
ORDER BY id;

SELECT TOP 10 *
FROM dbo.EventRegistrations;
GO
