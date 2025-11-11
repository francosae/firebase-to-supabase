# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firebase to Supabase migration toolkit that helps migrate Firebase projects to Supabase. The repository contains specialized tools for migrating:
- **Authentication users** (from Firebase Auth to Supabase Auth)
- **Firestore collections** (to PostgreSQL tables)
- **Storage files** (from Firebase Storage to Supabase Storage)
- **Functions** (minimal - requires manual migration)

Each migration domain is self-contained in its own directory with dedicated scripts.

## Architecture

### Directory Structure

- `auth/` - Firebase Auth to Supabase Auth migration
  - `firestoreusers2json.js/ts` - Export Firebase users to JSON
  - `import_users.js/ts` - Import users to Supabase PostgreSQL (auth.users table)
  - `middleware/verify-firebase-pw/` - Node.js/fly.io server for verifying Firebase passwords during migration
- `firestore/` - Firestore to PostgreSQL migration
  - `collections.js/ts` - List all Firestore collections
  - `firestore2json.js/ts` - Export Firestore collection to JSON (supports custom hooks)
  - `json2supabase.js/ts` - Import JSON to PostgreSQL with automatic table creation
  - `utils.js/ts` - Shared utilities
  - `HOOKS.md` - Documentation for custom data transformation hooks
- `storage/` - Firebase Storage to Supabase Storage migration
  - `download.js/ts` - Download files from Firebase Storage bucket
  - `upload.js/ts` - Upload files to Supabase Storage bucket
  - `utils.js/ts` - Shared utilities
- `functions/` - Placeholder for function migration (manual process)

### Key Technical Details

**Language**: TypeScript (with compiled JavaScript versions)

**Core Dependencies**:
- `firebase-admin` - Firebase SDK for server-side operations
- `@supabase/supabase-js` - Supabase client library
- `pg` - PostgreSQL client for direct database operations
- `stream-json` - Streaming JSON parser for handling large datasets
- `firebase-scrypt` - Password verification for Firebase password hashing

**Configuration Files**:
- `firebase-service.json` - Firebase Admin SDK credentials (download from Firebase Console)
- `supabase-service.json` - PostgreSQL connection credentials (host, port, user, password, database)
- `supabase-keys.js/ts` - Supabase API URL and service_role key (for storage operations)

**Password Migration Strategy**:
The auth middleware uses Firebase's scrypt algorithm to verify existing Firebase passwords. It requires 4 hash parameters from Firebase Console:
- `base64_signer_key`
- `base64_salt_separator`
- `rounds`
- `mem_cost`

**Data Streaming**: Large datasets are processed using streaming to avoid memory issues. Default batch size is 100 records but can be configured.

**Firestore Data Transformation**: Supports custom hooks (JS files matching collection name) that allow transforming documents during export, useful for flattening nested data into separate tables.

**Primary Key Strategies** for Firestore imports:
- `none` - No primary key
- `smallserial/serial/bigserial` - Auto-incrementing integers
- `uuid` - Random UUID
- `firestore_id` - Use existing Firestore document ID

## Common Commands

### Setup
```bash
# Install root dependencies
npm install

# Install middleware dependencies (for password verification)
cd auth/middleware/verify-firebase-pw
npm install
```

### Running Scripts

Since there's no centralized test or build system, each migration type is run independently using Node.js:

**Auth Migration:**
```bash
# Export Firebase users to JSON
node auth/firestoreusers2json.js [filename.json] [batch_size]

# Import users to Supabase
node auth/import_users.js <path_to_json_file> [batch_size]

# Run password verification middleware locally
cd auth/middleware/verify-firebase-pw
source ./local.env.sh
node server.js

# Deploy middleware to fly.io
flyctl launch
flyctl deploy
```

**Firestore Migration:**
```bash
# List all collections
node firestore/collections.js

# Export collection to JSON
node firestore/firestore2json.js <collectionName> [batchSize] [limit]

# Import JSON to Supabase
node firestore/json2supabase.js <path_to_json_file> [primary_key_strategy] [primary_key_name]
```

**Storage Migration:**
```bash
# Download from Firebase Storage
node storage/download.js <prefix> [folder] [batchSize] [limit] [token]

# Upload to Supabase Storage
node storage/upload.js <prefix> <folder> <bucket>
```

### TypeScript Usage
Scripts can be run directly with ts-node:
```bash
ts-node auth/firestoreusers2json.ts
ts-node firestore/firestore2json.ts <collectionName>
```

## Development Notes

**No Test Suite**: This repository does not have automated tests. Manual verification of migrations is required.

**Configuration Required**: Before running any migration, ensure the appropriate service account files are configured:
- Download `firebase-service.json` from Firebase Console
- Create `supabase-service.json` with PostgreSQL connection details
- Create `supabase-keys.js` with API credentials for storage operations

**Streaming Architecture**: The codebase uses `stream-json` to handle large datasets without loading entire files into memory. Be mindful of batch sizes when modifying import logic.

**Custom Hooks**: When migrating Firestore data, custom transformation hooks can be created by adding a `<collectionName>.js` file in the `firestore/` directory. See `firestore/HOOKS.md` for details.

**Direct PostgreSQL Access**: Auth and Firestore migrations write directly to PostgreSQL using the `pg` library, not through Supabase's REST API. This requires database credentials, not just API keys.

**Migration State**: Scripts generally don't maintain state. If a migration fails partway through, you may need to clean up partial imports manually in Supabase.
