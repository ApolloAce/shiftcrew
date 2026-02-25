import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

commands = [
    # Check the actual DB config
    "grep -E 'DB_|MYSQL|DATABASE|mysql' /var/www/shiftcrew/.env 2>/dev/null || grep -r 'DB_' /var/www/shiftcrew/.env* 2>/dev/null",
    # Check lib/mysql.ts for connection details
    "head -30 /var/www/shiftcrew/lib/mysql.ts",
    # Try mysql root
    '''mysql -u root -e "SHOW DATABASES;" 2>&1 | head -20''',
    # Check with the env vars
    "cat /var/www/shiftcrew/.env 2>/dev/null | grep -v '#' | head -20",
    "cat /var/www/shiftcrew/.env.local 2>/dev/null | grep -v '#' | head -20",
    # Check employee schedule page on the real server
    "head -25 /var/www/shiftcrew/app/employee/schedule/page.tsx",
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
