import paramiko
import time

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

def run(cmd: str, timeout: int = 60):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="ignore")
    err = stderr.read().decode(errors="ignore")
    if out.strip():
        print(out)
    if err.strip():
        print("ERR:", err)
    return out, err


run("cd /var/www/shiftcrew && pm2 stop shiftcrew || true", timeout=120)
run("cd /var/www/shiftcrew && rm -rf .next && rm -f /tmp/nextbuild.log", timeout=120)

# Start build in background and poll until finished.
run("cd /var/www/shiftcrew && nohup npm run build > /tmp/nextbuild.log 2>&1 < /dev/null & echo BUILD_STARTED", timeout=60)

max_checks = 120  # up to ~20 minutes
build_done = False
for i in range(max_checks):
    out, _ = run("pgrep -f 'next build' || true", timeout=30)
    pids = [line.strip() for line in out.splitlines() if line.strip()]
    if not pids:
        build_done = True
        print("Build process finished.")
        break

    # Show latest build progress every poll
    run("tail -n 5 /tmp/nextbuild.log", timeout=30)
    print(f"Waiting... ({i + 1}/{max_checks})")
    time.sleep(10)

if not build_done:
    print("Build did not finish within timeout window.")
    run("tail -n 80 /tmp/nextbuild.log", timeout=60)
    ssh.close()
    raise SystemExit(1)

run("tail -n 60 /tmp/nextbuild.log", timeout=60)
run("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env", timeout=120)
run("pm2 status", timeout=60)
run("curl -I -sS http://127.0.0.1:3000 || true", timeout=60)
run("curl -I -sS https://shiftcrew.me || true", timeout=60)

ssh.close()
print("\nRebuild flow complete.")
