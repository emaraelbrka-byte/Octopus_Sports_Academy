// Decides whether a participant (the account holder or a family member) may join a class.
// Rules: age must be inside the class age range and the swimming level must match the class level.
function checkEligibility(cls, participant) {
  if (participant.age < cls.min_age || participant.age > cls.max_age) {
    return { eligible: false, reason: `Age must be between ${cls.min_age} and ${cls.max_age}` };
  }
  if (participant.skill_level !== cls.skill_level) {
    return { eligible: false, reason: `This class is for ${cls.skill_level} swimmers` };
  }
  return { eligible: true, reason: null };
}

module.exports = { checkEligibility };
