# Backup & Restore Runbook (Security audit P-4, §14.G)

Atlas M0 has no automated backups. This runbook + `scripts/backup.js` provide a
nightly `mongodump` with optional S3 offsite copy and 30-day retention.

## Nightly backup

```bash
cd Backend
node scripts/backup.js          # local archive in ./backups
```

Requires the **MongoDB Database Tools** (`mongodump`) on PATH:
https://www.mongodb.com/docs/database-tools/installation/

### Offsite to S3 (recommended for production)

```bash
export BACKUP_S3_BUCKET=my-bucket
export BACKUP_S3_PREFIX=mongo-backups      # optional
node scripts/backup.js                      # dumps then `aws s3 cp`
```

Needs the AWS CLI configured with write access to the bucket.

### Schedule (cron, 02:30 daily)

```cron
30 2 * * * cd /app/Backend && /usr/bin/node scripts/backup.js >> /var/log/mongo-backup.log 2>&1
```

Env knobs: `BACKUP_DIR` (default `./backups`), `BACKUP_RETENTION_DAYS` (default `30`).

## Restore

```bash
# 1. Pull the archive (from S3 if offsite):
aws s3 cp s3://my-bucket/mongo-backups/mongo-<stamp>.gz ./restore.gz

# 2. Restore into a TARGET cluster. Use --drop to replace existing collections.
mongorestore --uri="<TARGET_MONGODB_URI>" --archive=./restore.gz --gzip --drop
```

## Restore drill (do this quarterly)

1. Spin up a scratch Atlas cluster (or local `mongod`).
2. Restore the latest archive into it with `mongorestore` (above).
3. Point a local Backend `.env` `MONGODB_URI` at the scratch cluster and boot.
4. Verify: log in, dashboard totals render, an expense list loads.
5. Record the date + outcome here:

| Date | Archive | Result | Notes |
|------|---------|--------|-------|
| _ | _ | _ | _ |
