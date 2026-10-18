/**
 * Best-effort translation of server-returned messages.
 * The server speaks English. When the user is in Hindi, we map known
 * patterns. For unknown messages, return the original (acceptable
 * fallback — error path, rare).
 */
export function translateServerMessage(message: string | undefined, lang: string): string {
  if (!message || lang !== 'hi') return message || '';

  const exact = SERVER_EXACT_HI[message];
  if (exact) return exact;

  for (const [pattern, replace] of SERVER_PATTERNS_HI) {
    const m = message.match(pattern);
    if (m) return replace(m);
  }
  return message;
}

const SERVER_EXACT_HI = {
  'Something went wrong. Please try again.': 'कुछ गड़बड़ हो गई। फिर से कोशिश करें।',
  'Please enter a valid amount.': 'सही रकम डालें।',
  'Invalid data format': 'जानकारी सही फ़ॉर्मेट में नहीं है',
  'Please provide your email and password': 'ईमेल और पासवर्ड दोनों डालें',
  'Please provide a valid email address': 'सही ईमेल पता डालें',
  'Please create a password': 'पासवर्ड बनाएँ',
  'Password must be at least 8 characters': 'पासवर्ड कम से कम 8 अक्षर का होना चाहिए',
  'Passwords do not match': 'पासवर्ड मेल नहीं खा रहे',
  'No account found with this email. Please check and try again.': 'इस ईमेल से कोई अकाउंट नहीं मिला। कृपया जांच कर फिर से कोशिश करें।',
  'Incorrect password. Please try again.': 'गलत पासवर्ड। फिर से कोशिश करें।',
  'Please provide your name to create the wedding': 'शादी बनाने के लिए अपना नाम डालें',
  'Please provide wedding name, couple names, and wedding date': 'शादी का नाम, जोड़े के नाम और शादी की तारीख डालें',
  'Please provide your email address': 'अपना ईमेल पता डालें',
  'Please provide the wedding code and your name': 'शादी का कोड और अपना नाम दोनों डालें',
  'No wedding found with this code. Please check and try again.': 'इस कोड से कोई शादी नहीं मिली। कृपया जांच कर फिर से कोशिश करें।',
  'Multiple weddings found. Please select one.': 'कई शादियाँ मिलीं। एक चुनें।',
  'Please select a wedding': 'शादी चुनें',
  'Wedding not found': 'शादी नहीं मिली',
  'Please provide the amount and category': 'रकम और कैटेगरी दोनों डालें',
  'Amount must be greater than zero': 'रकम शून्य से ज़्यादा होनी चाहिए',
  'Expense not found': 'खर्च नहीं मिला',
  'You can only edit your own expenses': 'आप सिर्फ अपने ही खर्च बदल सकते हैं',
  'You can only delete your own expenses': 'आप सिर्फ अपने ही खर्च हटा सकते हैं',
  'Member not found': 'सदस्य नहीं मिला',
  'Cannot remove the wedding admin': 'शादी के एडमिन को नहीं हटाया जा सकता',
  'Only the wedding admin can perform this action': 'यह काम सिर्फ शादी का एडमिन कर सकता है',
  'Please join a wedding first to access this feature': 'पहले किसी शादी से जुड़ें',
  'This member no longer exists': 'यह सदस्य अब नहीं है',
  'Your access has been deactivated by the wedding admin': 'एडमिन ने आपकी पहुँच बंद कर दी है',
  'Invalid session. Please rejoin the wedding.': 'सेशन सही नहीं है। शादी से दोबारा जुड़ें।',
  'Your session has expired. Please rejoin.': 'आपका सेशन खत्म हो गया। दोबारा जुड़ें।',
  'Authentication error': 'लॉगिन में दिक्कत',
  'Too many requests, please try again later': 'बहुत सारी कोशिशें हुईं, थोड़ी देर बाद कोशिश करें',
  'Too many attempts, please try again after 15 minutes': 'बहुत सारी कोशिशें हुईं, 15 मिनट बाद फिर कोशिश करें',
  'Google credential is required': 'Google क्रेडेंशियल चाहिए',
  'Invalid Google credential': 'गलत Google क्रेडेंशियल',
  'Invalid or expired Google credential': 'Google क्रेडेंशियल गलत है या उसकी समय-सीमा खत्म हो गई',
  'Google Sign-In is not configured on the server': 'सर्वर पर Google साइन-इन सेट नहीं है',
  'Your Google account email is not verified': 'आपके Google अकाउंट का ईमेल वेरिफाई नहीं है',
  'Could not get email from Google account': 'Google अकाउंट से ईमेल नहीं मिला',
  'No account found with this Google email. Please create a wedding first or join one with a code.': 'इस Google ईमेल से कोई अकाउंट नहीं मिला। पहले शादी बनाएँ या कोड से जुड़ें।',
  'No wedding found with this code.': 'इस कोड से कोई शादी नहीं मिली।',
  'Incorrect email or password. Please try again.': 'ईमेल या पासवर्ड गलत है। दोबारा कोशिश करें।',
  'Too many failed sign-in attempts. Please try again later.': 'बहुत बार गलत साइन-इन की कोशिश हुई। कुछ देर बाद फिर से कोशिश करें।',
  'Your email is verified. You can now use all features.': 'आपका ईमेल वेरिफाई हो गया। अब आप सभी फ़ीचर्स इस्तेमाल कर सकते हैं।',
  'This verification link is invalid or has expired. Please request a new one.': 'यह वेरिफिकेशन लिंक गलत है या इसकी समय-सीमा खत्म हो गई। नया लिंक माँगें।',
  'If an account exists for this email and is not yet verified, a verification link has been sent.': 'अगर इस ईमेल से अकाउंट है और अभी तक वेरिफाई नहीं हुआ, तो वेरिफिकेशन लिंक भेज दिया गया है।',
  'Please verify your email before resetting your password. We can resend the verification link.': 'पासवर्ड रीसेट करने से पहले अपना ईमेल वेरिफाई करें। हम वेरिफिकेशन लिंक दोबारा भेज सकते हैं।',
  'An account with this name already exists. Please use Login instead.': 'इस नाम से पहले से एक अकाउंट है। कृपया लॉगिन करें।',
  'If an account exists for this email, a reset link has been sent.': 'अगर इस ईमेल से कोई अकाउंट है, तो रीसेट लिंक भेज दिया गया है।',
  'This reset link is invalid or has expired. Please request a new one.': 'यह रीसेट लिंक गलत है या इसकी समय-सीमा खत्म हो गई। नया लिंक माँगें।',
  'Your password has been reset. You can now log in.': 'आपका पासवर्ड रीसेट हो गया। अब आप लॉगिन कर सकते हैं।',
  'Invalid request. Please provide a token and a new password.': 'गलत अनुरोध। टोकन और नया पासवर्ड दोनों दें।',
  'Wedding details updated': 'शादी की जानकारी अपडेट हो गई',
  'Expense updated': 'खर्च अपडेट हो गया',
  'Expense deleted': 'खर्च हटा दिया',
  'Wedding created successfully! Share the join code with family.': 'शादी बन गई! कोड परिवार के साथ शेयर करें।',
  'Receipt image must be under 5 MB': 'रसीद की फोटो 5 MB से छोटी होनी चाहिए',
  'Only image files are allowed (JPG, PNG, WebP, HEIC)': 'सिर्फ फोटो (JPG, PNG, WebP, HEIC) ही चलेगी',
  'Invalid file': 'गलत फ़ाइल',
  'Could not upload receipt. Expense saved — you can re-add the receipt later.': 'रसीद अपलोड नहीं हो सकी। खर्च सेव हो गया — रसीद बाद में दोबारा जोड़ सकते हैं।',
  'Receipt storage is not configured. Expense saved without receipt.': 'रसीद स्टोरेज सेट नहीं है। खर्च बिना रसीद के सेव हो गया।',
};

const SERVER_PATTERNS_HI: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Welcome back, (.+)!$/, (m) => `वापस स्वागत है, ${m[1]}!`],
  [/^Welcome, (.+)! You've joined (.+)\.$/, (m) => `स्वागत है, ${m[1]}! आप ${m[2]} में जुड़ गए हैं।`],
  [/^"(.+)" is not a valid category. Please choose from the available categories\.$/, (m) => `"${m[1]}" मान्य कैटेगरी नहीं है। उपलब्ध कैटेगरी में से चुनें।`],
  [/^(.+) has been removed$/, (m) => `${m[1]} हटा दिए गए`],
  [/^Route (.+) not found$/, (m) => `रास्ता ${m[1]} नहीं मिला`],
];
