import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Check all tables in DB
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SHOW TABLES;"''',
    # Check employees table structure
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "DESCRIBE employees;" 2>&1''',
    # Check all employees
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT id, firstName, surname, branchId, status FROM employees LIMIT 10;"''',
    # Read dashboard page to understand branch display logic (lines around where branch info shows)
    "sed -n '60,120p' /var/www/shiftcrew/app/dashboard/page.tsx",
    # Check what the employee page displays for branch
    "sed -n '460,490p' /var/www/shiftcrew/app/employee/page.tsx",
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
