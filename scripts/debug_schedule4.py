import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Confirm real app directory
    "ls /var/www/shiftcrew/package.json /var/www/shiftcrew/next.config.mjs 2>&1",
    "ls /var/www/shiftcrew/app/ | head -20",
    "ls /var/www/shiftcrew/app/employee/ | head -10",
    "ls /var/www/shiftcrew/app/dashboard/ | head -10",
    # Check if employee page exists there
    "ls -la /var/www/shiftcrew/app/employee/page.tsx 2>&1",
    "ls -la /var/www/shiftcrew/app/dashboard/page.tsx 2>&1",
    # Check schedule page for getShiftTimes (should NOT have it yet)
    "grep -c 'getShiftTimes' /var/www/shiftcrew/app/employee/schedule/page.tsx 2>&1",
    # Check DB from correct location
    '''mysql -u shiftcrew -p'ShiftCrew2024!' shiftcrew -e "SELECT COUNT(*) as total FROM schedules; SELECT COUNT(*) as total FROM employees; SELECT COUNT(*) as total FROM branches;"''',
    # Check current schedule data
    '''mysql -u shiftcrew -p'ShiftCrew2024!' shiftcrew -e "SELECT scheduleFor, time, LEFT(branchAssignments,400) as ba FROM schedules WHERE scheduleFor='2026-02-25' OR date='2026-02-25' LIMIT 5\\G"''',
]

for cmd in commands:
    print(f"\n{'='*60}")
    print(f"$ {cmd}")
    print('='*60)
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err and 'Warning' not in err: print("STDERR:", err)

ssh.close()
