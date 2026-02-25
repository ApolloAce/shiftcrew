import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Query with correct credentials
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT COUNT(*) as total FROM schedules;"''',
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT COUNT(*) as total FROM employees;"''',
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT COUNT(*) as total FROM branches;"''',
    # Get today's schedule
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT scheduleFor, time, LEFT(branchAssignments,500) as ba FROM schedules WHERE scheduleFor='2026-02-25' OR date='2026-02-25' LIMIT 3\\G"''',
    # Get any recent schedules
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT date, scheduleFor, time, weekStart FROM schedules ORDER BY date DESC LIMIT 5;"''',
    # Check dashboard page.tsx for branch display
    "grep -n 'branch\\|Branch\\|assigned' /var/www/shiftcrew/app/dashboard/page.tsx | head -20",
    # Check employee page.tsx for branch
    "grep -n 'branch\\|Branch\\|assigned' /var/www/shiftcrew/app/employee/page.tsx | head -20",
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
