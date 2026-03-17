import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

try:
    checks = [
        "grep -n 'COALESCE(scheduleFor, date) BETWEEN' /var/www/shiftcrew/app/api/schedules/route.ts",
        "grep -n 'trendSchedules' /var/www/shiftcrew/app/dashboard/reports/page.tsx",
    ]
    for cmd in checks:
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=20)
        out = stdout.read().decode(errors="replace").strip()
        err = stderr.read().decode(errors="replace").strip()
        print(f"$ {cmd}")
        print(out or "<no output>")
        if err:
            print(f"stderr: {err}")
        print()
finally:
    ssh.close()
