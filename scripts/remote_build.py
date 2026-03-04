import paramiko, sys, time
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

action = sys.argv[1] if len(sys.argv) > 1 else "start"

if action == "start":
    # Kill stale
    c.exec_command('pkill -9 -f "next build" 2>/dev/null')
    time.sleep(2)
    # Start build in background
    _, o, _ = c.exec_command(
        'cd /var/www/shiftcrew && nohup bash -c "npm run build > /tmp/nextbuild.log 2>&1 && pm2 restart shiftcrew >> /tmp/nextbuild.log 2>&1 && echo BUILD_AND_RESTART_DONE >> /tmp/nextbuild.log" &',
        timeout=10
    )
    time.sleep(1)
    print("Build started in background on server.")
    print("Run: python scripts/remote_build.py check")

elif action == "check":
    # Check if build is running
    _, o, _ = c.exec_command('pgrep -f "next build" || echo NOPROCESS', timeout=10)
    status = o.read().decode().strip()
    
    if status == "NOPROCESS":
        # Check if done
        _, o, _ = c.exec_command('grep "BUILD_AND_RESTART_DONE" /tmp/nextbuild.log 2>/dev/null && echo YES || echo NO', timeout=10)
        done = o.read().decode().strip()
        if "YES" in done:
            print("BUILD COMPLETE + PM2 RESTARTED!")
            _, o, _ = c.exec_command('tail -40 /tmp/nextbuild.log', timeout=10)
            print(o.read().decode('utf-8', errors='replace'))
        else:
            print("Build not running, but not completed either. Checking log...")
            _, o, _ = c.exec_command('tail -20 /tmp/nextbuild.log', timeout=10)
            print(o.read().decode('utf-8', errors='replace'))
    else:
        print(f"Build still running (PID: {status})")
        _, o, _ = c.exec_command('tail -5 /tmp/nextbuild.log', timeout=10)
        print(o.read().decode('utf-8', errors='replace'))

c.close()
