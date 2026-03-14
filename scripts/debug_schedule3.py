import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Full directory listing of app root
    "ls -la /root/shiftcrew/app/",
    # Check if page.tsx exists in app root vs subdirs
    "find /root/shiftcrew/app -maxdepth 1 -type f",
    # Check all directories
    "find /root/shiftcrew/app -type d | sort",
    # The employee page (main dashboard)
    "ls -la /root/shiftcrew/app/employee/",
    # The dashboard page
    "ls -la /root/shiftcrew/app/dashboard/",
    # Check all tables and row counts
    '''mysql -u shiftcrew -p'ShiftCrew2024!' shiftcrew -e "SELECT 'schedules' as tbl, COUNT(*) as cnt FROM schedules UNION ALL SELECT 'employees', COUNT(*) FROM employees UNION ALL SELECT 'branches', COUNT(*) FROM branches"''',
    # Check if schedules were deleted somehow
    '''mysql -u shiftcrew -p'ShiftCrew2024!' shiftcrew -e "SELECT COUNT(*) as total, MIN(date) as earliest, MAX(date) as latest FROM schedules"''',
    # Check next config
    "ls /root/shiftcrew/next.config.*",
    "ls /root/shiftcrew/package.json",
    # See what pm2 is actually running
    "pm2 show shiftcrew | grep -E 'script|cwd|exec'",
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
