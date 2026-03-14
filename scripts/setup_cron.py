import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# The cron entry: every Monday at 1:00 AM server time, call rotate endpoint
CRON_ENTRY = '0 1 * * 1 curl -s "http://localhost:3000/api/cron/rotate?secret=shiftcrew-cron-2026" >> /var/log/shiftcrew-cron.log 2>&1'

# Check existing crontab
_, o, _ = c.exec_command('crontab -l 2>/dev/null || echo "NO_CRONTAB"', timeout=10)
existing = o.read().decode('utf-8', errors='replace').strip()
print("=== EXISTING CRONTAB ===")
print(existing)

# Check if already installed
if 'cron/rotate' in existing:
    print("\nCron job already installed! No changes needed.")
else:
    # Append new entry
    if existing == "NO_CRONTAB":
        new_crontab = CRON_ENTRY + "\n"
    else:
        new_crontab = existing.rstrip('\n') + "\n" + CRON_ENTRY + "\n"
    
    # Install new crontab
    _, o, e = c.exec_command(f'echo "{new_crontab}" | crontab -', timeout=10)
    err = e.read().decode().strip()
    if err:
        print(f"ERROR: {err}")
    else:
        print("\nCron job installed successfully!")
    
    # Verify
    _, o, _ = c.exec_command('crontab -l', timeout=10)
    print("\n=== UPDATED CRONTAB ===")
    print(o.read().decode('utf-8', errors='replace'))

# Also create the log file
c.exec_command('touch /var/log/shiftcrew-cron.log')
print("\nLog file: /var/log/shiftcrew-cron.log")
print("Schedule: Every Monday at 1:00 AM server time")

c.close()
