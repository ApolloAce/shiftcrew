import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Check users table
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "DESCRIBE users;"''',
    # Check all users
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT id, firstName, surname, email, branchId, role, status FROM users;"''',
    # Check branches
    '''mysql -u shiftcrew_user -p'shiftcrew_client' shiftcrew -e "SELECT id, branchName, address FROM branches;"''',
    # Check employee page login/session code for branchId
    "sed -n '20,70p' /var/www/shiftcrew/app/employee/page.tsx",
    # Check login API for what it returns
    "head -50 /var/www/shiftcrew/app/api/login/route.ts",
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
