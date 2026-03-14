import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Check ALL schedules in DB
    '''mysql -u shiftcrew -p'ShiftCrew2024!' shiftcrew -e "SELECT id, date, scheduleFor, time, weekStart, LEFT(branchAssignments,300) as ba FROM schedules ORDER BY date DESC LIMIT 10\\G"''',
    # Check build output location
    "ls /root/shiftcrew/.next/ 2>/dev/null | head -20",
    # Check if it's a turbopack build
    "cat /root/shiftcrew/next.config.mjs",
    # Check the actual employee page path
    "find /root/shiftcrew/app/employee -name '*.tsx' -o -name '*.ts' | head -20",
    # Check employee dashboard page for branch display
    "find /root/shiftcrew/app -name 'page.tsx' | head -20",
    # See what week the schedule query would look for
    '''python3 -c "from datetime import datetime, timedelta; today=datetime(2026,2,25); dow=today.weekday(); monday=today-timedelta(days=dow); print('weekStart for today:', monday.strftime('%Y-%m-%d'))"''',
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
