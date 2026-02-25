import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Check deployed employee schedule page has getShiftTimes
    "grep -n 'getShiftTimes' /root/shiftcrew/app/employee/schedule/page.tsx | head -10",
    # Check deployed scheduling page has getShiftTimes
    "grep -n 'getShiftTimes' /root/shiftcrew/app/dashboard/scheduling/page.tsx | head -5",
    # Check the shift parsing section in deployed employee schedule
    "sed -n '96,120p' /root/shiftcrew/app/employee/schedule/page.tsx",
    # Query today's schedule data
    '''mysql -u shiftcrew -p'ShiftCrew2024!' shiftcrew -e "SELECT scheduleFor, time, SUBSTRING(branchAssignments, 1, 500) as ba FROM schedules WHERE scheduleFor = '2026-02-25' LIMIT 3\\G"''',
    # Check if .next/build was actually updated
    "ls -la /root/shiftcrew/.next/BUILD_ID",
    # Check pm2 status
    "pm2 status",
    # Check the employee page (dashboard) - what shows branches
    "grep -n 'branch\\|Branch' /root/shiftcrew/app/employee/page.tsx | head -20",
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
