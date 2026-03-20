import paramiko, sys

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

action = sys.argv[1] if len(sys.argv) > 1 else "check"

if action == "kill":
    i, o, e = c.exec_command("pkill -f 'next build'; sleep 2; echo KILLED", timeout=15)
    print(o.read().decode())
    i, o, e = c.exec_command("tail -30 /tmp/nextbuild.log", timeout=10)
    print(o.read().decode())

elif action == "force":
    # Safer force: do not kill an active build; ensure build artifacts exist before PM2 restart.
    print("Checking build status...")
    i, o, e = c.exec_command("pgrep -f '[n]ext build' || echo NOT_RUNNING", timeout=15)
    build_status = o.read().decode().strip()

    if build_status != "NOT_RUNNING":
        print(f"Build is currently running (PID: {build_status}).")
        print("Skipping restart to avoid .next corruption. Run: python scripts/build_check.py check")
    else:
        print("No active build process.")
        i, o, e = c.exec_command("test -f /var/www/shiftcrew/.next/BUILD_ID && echo BUILD_OK || echo BUILD_MISSING", timeout=15)
        artifact_status = o.read().decode().strip()

        if artifact_status != "BUILD_OK":
            print("Build artifacts missing. Running npm run build...")
            i, o, e = c.exec_command("cd /var/www/shiftcrew && npm run build > /tmp/nextbuild.log 2>&1 && echo BUILD_DONE || echo BUILD_FAILED", timeout=1800)
            result = o.read().decode().strip()
            print(result)
            if "BUILD_FAILED" in result:
                i, o, e = c.exec_command("tail -40 /tmp/nextbuild.log", timeout=30)
                print(o.read().decode())
                print("Build failed; PM2 restart skipped.")
            else:
                print("Restarting PM2...")
                i, o, e = c.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env 2>&1", timeout=30)
                print(o.read().decode())
                print("DONE")
        else:
            print("Build artifacts present.")
            print("Restarting PM2...")
            i, o, e = c.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env 2>&1", timeout=30)
            print(o.read().decode())
            print("DONE")

elif action == "rebuild":
    cmd = "cd /var/www/shiftcrew && rm -rf .next && nohup npx next build > /tmp/nextbuild.log 2>&1 < /dev/null & echo BUILD_STARTED"
    i, o, e = c.exec_command(cmd, timeout=30)
    o.channel.settimeout(10)
    try:
        out = o.read().decode().strip()
    except Exception:
        out = "BUILD_STARTED"
    print(out or "BUILD_STARTED")

elif action == "restart":
    i, o, e = c.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env 2>&1", timeout=30)
    print(o.read().decode())

elif action == "check":
    i, o, e = c.exec_command("pgrep -f '[n]ext build' || echo NOT_RUNNING", timeout=10)
    status = o.read().decode().strip()
    if status == "NOT_RUNNING":
        print("Build finished!")
        i, o, e = c.exec_command("tail -20 /tmp/nextbuild.log", timeout=10)
        print(o.read().decode())
        i, o, e = c.exec_command("grep -i 'error' /tmp/nextbuild.log | head -5", timeout=10)
        errs = o.read().decode().strip()
        if errs:
            print("ERRORS:", errs)
        else:
            print("No errors - ready)to restart")
    else:
        print(f"Still building (PID: {status})")
        i, o, e = c.exec_command("tail -5 /tmp/nextbuild.log", timeout=10)
        print(o.read().decode())

c.close()
