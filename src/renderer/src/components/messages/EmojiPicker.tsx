import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, Clock } from 'lucide-react'
import { C } from '../../theme'

// ─── Emoji data: categories with full standard emojis ────────────────────────
const CATEGORIES: { id: string; label: string; icon: string; emojis: string[] }[] = [
  {
    id: 'smileys', label: 'Smileys & People', icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
      '🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤',
      '😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓',
      '🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰',
      '😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈',
      '👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼',
      '😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💖','💗','💓','💞','💕',
      '💟','❣️','💔','❤️‍🔥','❤️‍🩹','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍',
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰',
      '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜',
      '👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶',
      '👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','🫦',
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆',
      '💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🫅','🤴','👸','👳','👲',
      '🧕','🤵','👰','🤰','🫃','🫄','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜',
      '🧝','🧞','🧟','🧌','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴️','👯','🧖','🧗',
      '🤸','⛹️','🏋️','🚴','🚵','🤼','🤽','🤾','🤺','⛷️','🏂','🏌️','🏇','🏊','🤹',
      '🧘','🛀','🛌','👭','👫','👬','💏','💑','👪','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦',
    ],
  },
  {
    id: 'nature', label: 'Animals & Nature', icon: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽',
      '🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇',
      '🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗',
      '🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟',
      '🐬','🐳','🐋','🦈','🪸','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫',
      '🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮',
      '🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨',
      '🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🐾','🐉','🐲',
      '🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁',
      '🍄','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕',
      '🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌎','🌍','🌏','🪐','💫','⭐','🌟','✨',
      '⚡','☄️','💥','🔥','🌪️','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️',
      '🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','🫧','☔','☂️','🌊','🌫️',
    ],
  },
  {
    id: 'food', label: 'Food & Drink', icon: '🍔',
    emojis: [
      '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝',
      '🍅','🫒','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄',
      '🥜','🫘','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓',
      '🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣',
      '🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤',
      '🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪',
      '🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾',
      '🍷','🍸','🍹','🍺','🍻','🥂','🥃','🫗','🥤','🧋','🧃','🧉','🧊',
    ],
  },
  {
    id: 'activities', label: 'Activities', icon: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍',
      '🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌',
      '🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊',
      '🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️',
      '🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸',
      '🪕','🎻','🪈','🎲','♟️','🎯','🎳','🎮','🕹️','🎰',
    ],
  },
  {
    id: 'travel', label: 'Travel & Places', icon: '🚗',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵',
      '🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','🛞','⛽','🛞','🚨','🚥','🚦',
      '🛑','🚧','⚓','🛟','⛵','🛶','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂',
      '💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🛎️','🧳','⌛','⏳','⌚','⏰','⏱️','⏲️',
      '🕰️','🌡️','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️',
      '🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩',
      '🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲',
      '⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🛝','🎡','🎢','💈','🎪',
      '🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐',
    ],
  },
  {
    id: 'objects', label: 'Objects', icon: '💡',
    emojis: [
      '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼',
      '📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭',
      '⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯️','🪔','🧯','🛢️',
      '💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️',
      '🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️',
      '🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹',
      '🩺','🩻','🩼','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽',
      '🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️',
      '🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊',
      '🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪',
      '📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆',
      '📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒',
      '📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍',
      '✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓',
    ],
  },
  {
    id: 'symbols', label: 'Symbols', icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','❤️‍🩹','💔','❣️','💕','💞',
      '💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️',
      '🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️',
      '🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️',
      '🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫',
      '💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️',
      '🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐',
      '💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅',
      '🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣',
      '5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️',
      '⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️',
      '↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖',
      '➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','👁️‍🗨️','🔚','🔙','🔛','🔝','🔜',
      '〰️','➰','➿','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺',
      '🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨',
      '🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','👁️‍🗨️',
      '💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕',
      '🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧',
    ],
  },
  {
    id: 'flags', label: 'Flags', icon: '🏁',
    emojis: [
      '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️',
      '🇦🇫','🇦🇱','🇩🇿','🇦🇸','🇦🇩','🇦🇴','🇦🇮','🇦🇶','🇦🇬','🇦🇷','🇦🇲','🇦🇼',
      '🇦🇺','🇦🇹','🇦🇿','🇧🇸','🇧🇭','🇧🇩','🇧🇧','🇧🇾','🇧🇪','🇧🇿','🇧🇯','🇧🇲',
      '🇧🇹','🇧🇴','🇧🇦','🇧🇼','🇧🇷','🇮🇴','🇻🇬','🇧🇳','🇧🇬','🇧🇫','🇧🇮','🇰🇭',
      '🇨🇲','🇨🇦','🇮🇨','🇨🇻','🇧🇶','🇰🇾','🇨🇫','🇹🇩','🇨🇱','🇨🇳','🇨🇽','🇨🇨',
      '🇨🇴','🇰🇲','🇨🇬','🇨🇩','🇨🇰','🇨🇷','🇨🇮','🇭🇷','🇨🇺','🇨🇼','🇨🇾','🇨🇿',
      '🇩🇰','🇩🇯','🇩🇲','🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇬🇶','🇪🇷','🇪🇪','🇸🇿','🇪🇹',
      '🇪🇺','🇫🇰','🇫🇴','🇫🇯','🇫🇮','🇫🇷','🇬🇫','🇵🇫','🇹🇫','🇬🇦','🇬🇲','🇬🇪',
      '🇩🇪','🇬🇭','🇬🇮','🇬🇷','🇬🇱','🇬🇩','🇬🇵','🇬🇺','🇬🇹','🇬🇬','🇬🇳','🇬🇼',
      '🇬🇾','🇭🇹','🇭🇳','🇭🇰','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪','🇮🇲',
      '🇮🇱','🇮🇹','🇯🇲','🇯🇵','🎌','🇯🇪','🇯🇴','🇰🇿','🇰🇪','🇰🇮','🇽🇰','🇰🇼',
      '🇰🇬','🇱🇦','🇱🇻','🇱🇧','🇱🇸','🇱🇷','🇱🇾','🇱🇮','🇱🇹','🇱🇺','🇲🇴','🇲🇬',
      '🇲🇼','🇲🇾','🇲🇻','🇲🇱','🇲🇹','🇲🇭','🇲🇶','🇲🇷','🇲🇺','🇾🇹','🇲🇽','🇫🇲',
      '🇲🇩','🇲🇨','🇲🇳','🇲🇪','🇲🇸','🇲🇦','🇲🇿','🇲🇲','🇳🇦','🇳🇷','🇳🇵','🇳🇱',
      '🇳🇨','🇳🇿','🇳🇮','🇳🇪','🇳🇬','🇳🇺','🇳🇫','🇰🇵','🇲🇰','🇲🇵','🇳🇴','🇴🇲',
      '🇵🇰','🇵🇼','🇵🇸','🇵🇦','🇵🇬','🇵🇾','🇵🇪','🇵🇭','🇵🇳','🇵🇱','🇵🇹','🇵🇷',
      '🇶🇦','🇷🇪','🇷🇴','🇷🇺','🇷🇼','🇼🇸','🇸🇲','🇸🇹','🇸🇦','🇸🇳','🇷🇸','🇸🇨',
      '🇸🇱','🇸🇬','🇸🇽','🇸🇰','🇸🇮','🇬🇸','🇸🇧','🇸🇴','🇿🇦','🇰🇷','🇸🇸','🇪🇸',
      '🇱🇰','🇧🇱','🇸🇭','🇰🇳','🇱🇨','🇵🇲','🇻🇨','🇸🇩','🇸🇷','🇸🇪','🇨🇭','🇸🇾',
      '🇹🇼','🇹🇯','🇹🇿','🇹🇭','🇹🇱','🇹🇬','🇹🇰','🇹🇴','🇹🇹','🇹🇳','🇹🇷','🇹🇲',
      '🇹🇨','🇹🇻','🇻🇮','🇺🇬','🇺🇦','🇦🇪','🇬🇧','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿','🇺🇸','🇺🇾',
      '🇺🇿','🇻🇺','🇻🇦','🇻🇪','🇻🇳','🇼🇫','🇪🇭','🇾🇪','🇿🇲','🇿🇼',
    ],
  },
]

// Simple emoji name mapping for search (covers the most commonly searched terms)
const SEARCH_KEYWORDS: Record<string, string[]> = {
  '😀': ['grinning','happy','smile'], '😃': ['smiley','happy'], '😄': ['smile','happy','joy'],
  '😁': ['grin','happy'], '😆': ['laugh','satisfied'], '😅': ['sweat','nervous','laugh'],
  '🤣': ['rofl','rolling','laughing'], '😂': ['joy','crying','laughing','lol','funny'],
  '🙂': ['slightly','smile'], '🙃': ['upside','down'], '😉': ['wink'],
  '😊': ['blush','smile','happy'], '😇': ['angel','innocent','halo'],
  '🥰': ['love','hearts','adore'], '😍': ['heart','eyes','love'],
  '🤩': ['star','struck','excited'], '😘': ['kiss','love','blow'],
  '😋': ['yummy','delicious','tongue'], '😛': ['tongue'],
  '😜': ['wink','tongue','crazy'], '🤪': ['zany','crazy','wild'],
  '🤑': ['money','rich','dollar'], '🤗': ['hug','hugging'],
  '🤔': ['think','thinking','hmm'], '🤐': ['zipper','quiet','secret'],
  '😐': ['neutral','blank'], '😑': ['expressionless'],
  '😏': ['smirk','smug'], '😒': ['unamused','meh'],
  '🙄': ['eye','roll','whatever'], '😬': ['grimace','awkward'],
  '😌': ['relieved','calm'], '😔': ['pensive','sad'],
  '😪': ['sleepy','tired'], '🤤': ['drool','drooling'],
  '😴': ['sleep','zzz','tired'], '😷': ['mask','sick','covid'],
  '🤒': ['thermometer','sick','fever'], '🤕': ['bandage','hurt'],
  '🤢': ['nauseous','green','sick'], '🤮': ['vomit','puke','sick'],
  '🥵': ['hot','sweating'], '🥶': ['cold','freezing'],
  '😵': ['dizzy','dead'], '🤯': ['mind','blown','exploding'],
  '🤠': ['cowboy','hat'], '🥳': ['party','celebrate','birthday'],
  '😎': ['cool','sunglasses'], '🤓': ['nerd','glasses'],
  '😕': ['confused'], '😟': ['worried'], '😮': ['open','mouth','surprised'],
  '😲': ['astonished','shocked'], '😳': ['flushed','embarrassed'],
  '🥺': ['pleading','puppy','eyes'], '😦': ['frowning'],
  '😨': ['fearful','scared'], '😰': ['anxious','sweat'],
  '😥': ['disappointed','relieved'], '😢': ['cry','sad','tear'],
  '😭': ['crying','loud','sob','bawling'], '😱': ['scream','scared','terrified'],
  '😤': ['triumph','steam','huffing'], '😡': ['angry','rage','mad'],
  '😠': ['angry','mad'], '🤬': ['swearing','cursing','symbols'],
  '😈': ['devil','horns'], '👿': ['imp','angry','devil'],
  '💀': ['skull','dead','death'], '💩': ['poop','poo'],
  '🤡': ['clown'], '👻': ['ghost','boo'],
  '👽': ['alien','ufo'], '🤖': ['robot','bot'],
  '❤️': ['heart','red','love'], '🧡': ['orange','heart'],
  '💛': ['yellow','heart'], '💚': ['green','heart'],
  '💙': ['blue','heart'], '💜': ['purple','heart'],
  '🖤': ['black','heart'], '🤍': ['white','heart'],
  '💔': ['broken','heart'], '💯': ['hundred','perfect','score'],
  '👍': ['thumbs','up','yes','good','ok','like'], '👎': ['thumbs','down','no','bad','dislike'],
  '👋': ['wave','hi','hello','bye'], '👏': ['clap','applause','bravo'],
  '🙏': ['pray','please','thanks','namaste'], '🤝': ['handshake','deal'],
  '✊': ['fist','power'], '👊': ['punch','fist','bump'],
  '✌️': ['peace','victory'], '🤞': ['crossed','fingers','luck'],
  '🤟': ['love','you','rock'], '🤘': ['rock','metal','horns'],
  '👌': ['ok','perfect','fine'], '💪': ['muscle','strong','flex','bicep'],
  '🔥': ['fire','hot','lit'], '✨': ['sparkles','magic','stars'],
  '⭐': ['star'], '🌟': ['glowing','star'], '💫': ['dizzy','star'],
  '🎉': ['party','popper','celebrate','tada'], '🎊': ['confetti'],
  '🎈': ['balloon'], '🎁': ['gift','present'],
  '🎂': ['birthday','cake'], '🍕': ['pizza'],
  '🍔': ['burger','hamburger'], '🍟': ['fries','french'],
  '🌮': ['taco'], '🍦': ['ice','cream'],
  '☕': ['coffee','hot','drink'], '🍺': ['beer'],
  '🍷': ['wine'], '🍻': ['cheers','beers'],
  '❌': ['x','cross','no','wrong'], '✅': ['check','yes','done','correct'],
  '⚠️': ['warning','alert','caution'], '🚀': ['rocket','launch','ship'],
  '💡': ['idea','bulb','light'], '💻': ['laptop','computer'],
  '📱': ['phone','mobile','iphone'], '🎮': ['game','controller','gaming'],
  '🎵': ['music','note'], '🎶': ['music','notes'],
  '📖': ['book','read'], '📝': ['memo','note','write'],
  '🔒': ['lock','secure','private'], '🔓': ['unlock','open'],
  '⏰': ['alarm','clock','time'], '📌': ['pin','pushpin'],
  '🔗': ['link','chain'], '📧': ['email','mail'],
  '⚡': ['lightning','bolt','zap','flash','electric'],
  '🐶': ['dog','puppy'], '🐱': ['cat','kitty'],
  '🐻': ['bear'], '🦊': ['fox'],
  '🐸': ['frog'], '🐵': ['monkey'],
  '🦄': ['unicorn'], '🐍': ['snake'],
  '🦁': ['lion'], '🐯': ['tiger'],
  '🐘': ['elephant'], '🐧': ['penguin'],
  '🐢': ['turtle'], '🐬': ['dolphin'],
  '🦈': ['shark'], '🐳': ['whale'],
  '🌹': ['rose','flower'], '🌻': ['sunflower'],
  '🌈': ['rainbow'], '☀️': ['sun','sunny'],
  '🌙': ['moon','crescent'], '⛅': ['cloudy','cloud'],
  '🌧️': ['rain','rainy'], '❄️': ['snow','snowflake','cold'],
  '☔': ['umbrella','rain'], '🌊': ['wave','ocean','sea'],
  '🏠': ['house','home'], '🏢': ['office','building'],
  '🚗': ['car','automobile'], '✈️': ['airplane','plane','flight'],
  '⏳': ['hourglass','time','waiting'],
  '💰': ['money','bag','rich'], '💎': ['diamond','gem'],
  '🏆': ['trophy','winner','champion'], '🥇': ['gold','medal','first'],
  '🎯': ['target','bullseye','direct','hit'], '🎲': ['dice','game'],
  '🔑': ['key'], '🗝️': ['old','key'],
  '💬': ['speech','bubble','comment','chat'], '💭': ['thought','bubble','thinking'],
  '👀': ['eyes','look','see'], '👁️': ['eye'],
  '👅': ['tongue'], '👄': ['lips','mouth'],
  '🫶': ['heart','hands','love'], '🫡': ['salute'],
}

const RECENT_STORAGE_KEY = 'emoji-picker-recents'
const MAX_RECENTS = 32

function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]') }
  catch { return [] }
}

function addRecent(emoji: string) {
  const recents = getRecents().filter(e => e !== emoji)
  recents.unshift(emoji)
  if (recents.length > MAX_RECENTS) recents.length = MAX_RECENTS
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recents))
}

// ─── Component ───────────────────────────────────────────────────────────────
export function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('smileys')
  const [recents, setRecents] = useState<string[]>(getRecents)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Compute fixed position from parent
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const pickerWidth = 320
    const pickerHeight = 400
    let top = rect.top - pickerHeight - 6
    let left = rect.left
    // Keep within viewport
    if (top < 4) top = 4
    if (left + pickerWidth > window.innerWidth - 4) left = window.innerWidth - pickerWidth - 4
    if (left < 4) left = 4
    setPos({ top, left })
  }, [])

  // Focus search on mount
  useEffect(() => { searchRef.current?.focus() }, [])

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleSelect = (emoji: string) => {
    addRecent(emoji)
    setRecents(getRecents())
    onSelect(emoji)
  }

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase().trim()
    const results: string[] = []
    const seen = new Set<string>()
    // Search through all categories and keyword data
    for (const cat of CATEGORIES) {
      for (const emoji of cat.emojis) {
        if (seen.has(emoji)) continue
        const keywords = SEARCH_KEYWORDS[emoji]
        if (
          emoji.includes(q) ||
          (keywords && keywords.some(k => k.includes(q))) ||
          cat.label.toLowerCase().includes(q)
        ) {
          seen.add(emoji)
          results.push(emoji)
        }
      }
    }
    return results
  }, [search])

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId)
    const el = sectionRefs.current[catId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Track scroll position to sync active category tab
  const handleScroll = () => {
    if (search.trim()) return
    const scrollEl = document.getElementById('emoji-scroll-container')
    if (!scrollEl) return
    const scrollTop = scrollEl.scrollTop + 10
    for (const cat of CATEGORIES) {
      const el = sectionRefs.current[cat.id]
      if (el && el.offsetTop <= scrollTop) setActiveCategory(cat.id)
    }
  }

  const renderGrid = (emojis: string[]) => (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 0,
    }}>
      {emojis.map((emoji, i) => (
        <button
          key={`${emoji}-${i}`}
          onClick={() => handleSelect(emoji)}
          style={{
            width: 36, height: 36, border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 22, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.1s, transform 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.transform = 'scale(1.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  )

  return (
    <div ref={containerRef} style={{
      width: 320, height: 400, borderRadius: 10,
      background: C.bgFloating, border: `1px solid ${C.separator}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      position: 'fixed',
      top: pos?.top ?? -9999,
      left: pos?.left ?? -9999,
      zIndex: 99999,
    }}>
      {/* Search */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: C.bgInput, borderRadius: 6, padding: '6px 8px',
          border: `1px solid ${C.separator}`,
        }}>
          <Search size={14} color={C.textMuted} style={{ flexShrink: 0 }} />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emoji..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: C.text, fontSize: 13, fontFamily: 'inherit',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', color: C.textMuted,
            }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!search.trim() && (
        <div style={{
          display: 'flex', padding: '0 6px', gap: 0, borderBottom: `1px solid ${C.separator}`,
          flexShrink: 0,
        }}>
          {/* Recent tab */}
          {recents.length > 0 && (
            <button
              onClick={() => scrollToCategory('recent')}
              style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                background: 'transparent', fontSize: 16,
                borderBottom: activeCategory === 'recent' ? `2px solid ${C.accent}` : '2px solid transparent',
                opacity: activeCategory === 'recent' ? 1 : 0.5,
                transition: 'opacity 0.15s',
              }}
              title="Recently Used"
            >
              <Clock size={14} />
            </button>
          )}
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                background: 'transparent', fontSize: 16,
                borderBottom: activeCategory === cat.id ? `2px solid ${C.accent}` : '2px solid transparent',
                opacity: activeCategory === cat.id ? 1 : 0.5,
                transition: 'opacity 0.15s',
              }}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        id="emoji-scroll-container"
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 10px' }}
      >
        {filteredCategories !== null ? (
          /* Search results */
          filteredCategories.length > 0 ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, padding: '4px 6px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Search Results ({filteredCategories.length})
              </div>
              {renderGrid(filteredCategories)}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textMuted, gap: 8 }}>
              <span style={{ fontSize: 32 }}>🔍</span>
              <span style={{ fontSize: 13 }}>No emoji found</span>
            </div>
          )
        ) : (
          <>
            {/* Recent */}
            {recents.length > 0 && (
              <div ref={el => { sectionRefs.current['recent'] = el }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, padding: '4px 6px 6px', textTransform: 'uppercase', letterSpacing: 0.5, position: 'sticky', top: 0, background: C.bgFloating, zIndex: 1 }}>
                  Recently Used
                </div>
                {renderGrid(recents)}
              </div>
            )}
            {/* Category sections */}
            {CATEGORIES.map(cat => (
              <div key={cat.id} ref={el => { sectionRefs.current[cat.id] = el }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, padding: '8px 6px 6px', textTransform: 'uppercase', letterSpacing: 0.5, position: 'sticky', top: 0, background: C.bgFloating, zIndex: 1 }}>
                  {cat.label}
                </div>
                {renderGrid(cat.emojis)}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
