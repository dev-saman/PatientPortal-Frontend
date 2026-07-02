export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.";

export interface PasswordRequirementChecklist {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialCharacter: boolean;
}

export const PASSWORD_REQUIREMENT_ITEMS: {
  key: keyof PasswordRequirementChecklist;
  label: string;
}[] = [
  { key: "minLength", label: "At least 8 characters" },
  { key: "uppercase", label: "One uppercase letter (A-Z)" },
  { key: "lowercase", label: "One lowercase letter (a-z)" },
  { key: "number", label: "One number (0-9)" },
  { key: "specialCharacter", label: "One special character (e.g. !@#$%, not _)" },
];

// Underscore is intentionally excluded from the special character check.
const SPECIAL_CHARACTER_REGEX = /[^A-Za-z0-9_]/;

export function getPasswordRequirements(password: string): PasswordRequirementChecklist {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    specialCharacter: SPECIAL_CHARACTER_REGEX.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  return Object.values(getPasswordRequirements(password)).every(Boolean);
}

export function doPasswordsMatch(password: string, confirmPassword: string): boolean {
  return password.length > 0 && password === confirmPassword;
}
