import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)


def run(cmd: str):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode(errors="ignore")
    err = stderr.read().decode(errors="ignore")
    if out.strip():
        print(out)
    if err.strip():
        print("ERR:", err)


run("cd /var/www/shiftcrew && pm2 stop shiftcrew || true")
run("cd /var/www/shiftcrew && rm -rf .next")
run("cd /var/www/shiftcrew && npm run build > /tmp/nextbuild.log 2>&1")
run("tail -n 60 /tmp/nextbuild.log")
run("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env")
run("pm2 status")
run("ss -ltnp | grep 3000 || true")
run("curl -I -sS http://127.0.0.1:3000 || true")
run("curl -I -sS https://shiftcrew.me || true")

ssh.close()
print("\nDone.")
