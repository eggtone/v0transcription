# Batch System Test Scripts

This directory contains test scripts to verify the Groq batch processing system is working correctly.

## Quick Test

Run the simple test to verify basic functionality:

```bash
npm run test:batch
```

This will test:
- ✅ Server connectivity  
- ✅ Database operations
- ✅ API endpoints
- ✅ Background poller
- ✅ Job lifecycle (submit → status → cancel)

## Detailed Test

For more comprehensive testing with verbose output:

```bash
npm run test:batch:verbose
```

## Prerequisites

1. **Development server running:**
   ```bash
   npm run dev
   ```

2. **Environment variables set:**
   ```bash
   # .env.local
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_API_BASE_URL=https://api.groq.com/openai/v1
   ```

3. **Database permissions:**
   - Ensure the `data/` directory is writable
   - SQLite database will be created automatically

## Expected Results

### ✅ All Tests Pass
Your batch system is ready for production use.

### ⚠️ Most Tests Pass (Batch Submission Fails)
This is normal when testing with mock data. The system is working, but Groq API rejects the fake audio files.

### ❌ Multiple Test Failures
Check:
- Is your development server running on port 3000?
- Are your environment variables set correctly?
- Do you have write permissions in the project directory?
- Check console logs for specific error messages

## Test Files Created

The tests will create:
- `data/transcriptor.db` - SQLite database
- `data/transcriptor.db-wal` and `data/transcriptor.db-shm` - SQLite journal files
- Temporary files in system temp directory (auto-cleaned)

## Manual Testing

You can also test individual endpoints manually:

```bash
# Check poller status
curl http://localhost:3000/api/batch/poller

# List batch jobs
curl http://localhost:3000/api/batch/list

# Start poller
curl -X POST http://localhost:3000/api/batch/poller \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "intervalMs": 30000}'
```

## Troubleshooting

### Database Errors
```bash
# Check if data directory exists and is writable
ls -la data/
```

### API Errors
```bash
# Check if server is running
curl http://localhost:3000/api/batch/list
```

### Groq API Errors
- Verify `GROQ_API_KEY` is valid
- Check Groq API status at https://console.groq.com/
- Ensure you have batch processing enabled in your Groq account

## Next Steps

After tests pass:
1. **Test with real audio files** - Replace mock data with actual audio
2. **Monitor batch jobs** - Check the database for job progress  
3. **Set up notifications** - Configure email/webhook endpoints
4. **Add UI components** - Integrate batch mode into the frontend