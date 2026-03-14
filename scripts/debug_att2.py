import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

# Check what the attendance API returns for today
stdin, stdout, stderr = ssh.exec_command(
    "mysql -u root shiftcrew -e \"SELECT id, employeeId, date, status, timeIn FROM daily_attendance WHERE date = '2026-02-27' LIMIT 10;\""
)
print('=== DB RECORDS FOR TODAY ===')
print(stdout.read().decode())

# Check what the schedule has for the current week
stdin, stdout, stderr = ssh.exec_command(
    """mysql -u root shiftcrew -e "SELECT id, weekStart, weekEnd, LEFT(branchAssignments, 500) as ba_preview FROM schedules WHERE weekStart <= '2026-02-27' AND weekEnd >= '2026-02-27' LIMIT 3;" """
)
print('=== SCHEDULE FOR THIS WEEK ===')
print(stdout.read().decode())

# Hit the API like the frontend does
stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:3000/api/attendance?date=2026-02-27')
print('=== API RESPONSE for 2026-02-27 ===')
resp = stdout.read().decode()
print(resp[:2000])

# Check PM2 logs for errors
stdin, stdout, stderr = ssh.exec_command('pm2 logs shiftcrew --lines 30 --nostream')
print('=== PM2 LOGS (last 30) ===')
out = stdout.read().decode()
err = stderr.read().decode()
print(out[-2000:] if len(out) > 2000 else out)
if err:
    print("STDERR:", err[-1000:])

ssh.close()
