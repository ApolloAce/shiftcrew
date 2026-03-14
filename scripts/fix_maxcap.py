import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Add maxCapacity column
cmd = 'mysql -u root shiftcrew -e "ALTER TABLE branches ADD COLUMN maxCapacity INT DEFAULT NULL" 2>&1'
_, o, _ = c.exec_command(cmd, timeout=10)
result = o.read().decode().strip()
print(f"ALTER: {result or 'OK'}")

# Verify
cmd2 = """mysql -u root shiftcrew -e "SHOW COLUMNS FROM branches LIKE 'maxCapacity'" 2>&1"""
_, o, _ = c.exec_command(cmd2, timeout=10)
print(f"Verify: {o.read().decode().strip()}")

c.close()
