function normalizePhone(phone) {
  return phone.replace(/\D/g, ''); // remove all non-digit characters
}

function groupByNormalizedPhone(users) {
  const map = new Map();

  for (const user of users) {
    const norm = normalizePhone(user.phone_number);
    if (!map.has(norm)) map.set(norm, []);
    map.get(norm).push(user);
  }

  // return only groups with duplicates
  return Array.from(map.values()).filter(group => group.length > 1);
}

module.exports = { normalizePhone, groupByNormalizedPhone };
