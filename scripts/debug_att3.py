import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

# 1. Verify the fix is deployed - check for Record pattern in source
stdin, stdout, stderr = ssh.exec_command('grep -c "Object.keys(dayAtt)" /var/www/shiftcrew/app/dashboard/scheduling/page.tsx')
print('=== FIX DEPLOYED CHECK (Object.keys count) ===')
print(stdout.read().decode().strip())

# Also check there are no Map references left
stdin, stdout, stderr = ssh.exec_command('grep -c "new Map" /var/www/shiftcrew/app/dashboard/scheduling/page.tsx')
print('=== OLD MAP REFERENCES ===')
print(stdout.read().decode().strip())

# 2. Check scheduleFor values for this week's schedules
stdin, stdout, stderr = ssh.exec_command(
    '''mysql -u root shiftcrew -e "SELECT id, date, scheduleFor, weekStart, weekEnd FROM schedules WHERE weekStart = '2026-02-23' ORDER BY scheduleFor;"'''
)
print('\n=== SCHEDULE ROWS FOR THIS WEEK ===')
print(stdout.read().decode())

# 3. API test: what does /api/schedules?weekStart=2026-02-23 return?
stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:3000/api/schedules?weekStart=2026-02-23 | python3 -c "import json,sys; data=json.load(sys.stdin); print(f\'Total schedules: {len(data)}\'); [print(f\'{s.get(\"id\",\"\")[:8]}... scheduleFor={s.get(\"scheduleFor\")}, date={s.get(\"date\")}, ba_count={len(s.get(\"branchAssignments\",[])) if s.get(\"branchAssignments\") else 0}\') for s in data]"'
)
print('=== API SCHEDULES RESPONSE ===')
print(stdout.read().decode())

# 4. Check attendance API for each day this week
for day in range(23, 28):
    date_str = f'2026-02-{day:02d}'
    stdin, stdout, stderr = ssh.exec_command(f'curl -s http://localhost:3000/api/attendance?date={date_str} | python3 -c "import json,sys; data=json.load(sys.stdin); print(f\'{date_str}: {{len(data)}} records\'); [print(f\'  {{r[\"employeeName\"]}}: {{r[\"status\"]}}\') for r in data]" 2>/dev/null || echo "{date_str}: error"')
    print(stdout.read().decode().strip())

ssh.close()
