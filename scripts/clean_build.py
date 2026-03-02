import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e')

# Kill stale builds
print("Killing stale builds...")
c.exec_command('pkill -f "next build" 2>/dev/null')
time.sleep(3)

# Start fresh build
print("Starting build...")
_, o, e = c.exec_command('cd /var/www/shiftcrew && npm run build > build_output.txt 2>&1 && pm2 restart shiftcrew && echo DONE')

# Wait for completion
while True:
    if o.channel.exit_status_ready():
        break
    time.sleep(5)
    print("  waiting...")

output = o.read().decode('utf-8', errors='replace')
err = e.read().decode('utf-8', errors='replace')
exit_code = o.channel.recv_exit_status()

# Print last 500 chars of output
print("OUTPUT (tail):", output[-500:])
if err:
    print("STDERR:", err[-300:])
print("EXIT CODE:", exit_code)

# Check errors in build
error_count = output.lower().count('error')
print(f"Error mentions: {error_count}")

if exit_code == 0:
    print("DEPLOYED SUCCESSFULLY!")
else:
    print("BUILD FAILED!")

c.close()
