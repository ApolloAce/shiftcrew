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
    # Kill any build, then restart PM2
    print("Killing builds...")
    i, o, e = c.exec_command("pkill -9 -f 'next build' 2>/dev/null; sleep 1; echo BUILD_KILLED", timeout=15)
    print(o.read().decode())
    print("Restarting PM2...")
    i, o, e = c.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env 2>&1", timeout=30)
    print(o.read().decode())
    print("DONE")

elif action == "rebuild":
    i, o, e = c.exec_command("cd /var/www/shiftcrew && rm -rf .next && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!", timeout=30)
    print("Build PID:", o.read().decode().strip())

elif action == "restart":
    i, o, e = c.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env 2>&1", timeout=30)
    print(o.read().decode())

elif action == "check":
    i, o, e = c.exec_command("pgrep -f 'next build' || echo NOT_RUNNING", timeout=10)
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
