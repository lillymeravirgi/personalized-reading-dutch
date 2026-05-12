import json

data = {
    "A1": [
        "ik|I", "jij|you", "hij|he", "zij|she", "wij|we", "naam|name", "hoe|how", "wat|what", "waar|where", "wie|who", "dag|day", "hallo|hello", "bedankt|thank you", "alstublieft|please", "ja|yes", "nee|no",
        "een|one", "twee|two", "drie|three", "vier|four", "vijf|five", "zes|six", "zeven|seven", "acht|eight", "negen|nine", "tien|ten", "honderd|hundred",
        "vandaag|today", "morgen|tomorrow", "nu|now", "tijd|time", "week|week", "maand|month", "jaar|year",
        "vader|father", "moeder|mother", "broer|brother", "zus|sister", "zoon|son", "dochter|daughter", "man|man", "vrouw|woman", "kind|child", "baby|baby", "opa|grandfather", "oma|grandmother",
        "water|water", "brood|bread", "koffie|coffee", "thee|tea", "melk|milk", "appel|apple", "eten|food", "drinken|drink",
        "huis|house", "tafel|table", "stoel|chair", "deur|door", "raam|window", "keuken|kitchen", "bed|bed", "kamer|room",
        "zijn|to be", "hebben|to have", "gaan|to go", "komen|to come", "zien|to see", "doen|to do", "leren|to learn", "werken|to work", "kopen|to buy", "praten|to talk", "luisteren|to listen", "kijken|to look", "wonen|to live", "slapen|to sleep",
        "goed|good", "slecht|bad", "mooi|beautiful", "lelijk|ugly", "groot|big", "klein|small", "warm|warm", "koud|cold", "nieuw|new", "oud|old", "rood|red", "blauw|blue",
        "auto|car", "fiets|bicycle", "stad|city", "winkel|shop", "school|school", "boek|book", "pen|pen", "papier|paper", "telefoon|telephone", "geld|money",
        "de|the", "het|the", "een|a", "en|and", "maar|but", "niet|not", "geen|none", "hier|here", "daar|there", "in|in", "op|on", "van|of", "met|with", "voor|for"
    ],
    "A2": [
        "opstaan|to get up", "douchen|to shower", "ontbijten|to have breakfast", "aankleden|to get dressed", "opruimen|to tidy up", "koken|to cook", "afwassen|to wash up", "wakker worden|to wake up", "wandelen|to walk", "sporten|to exercise", "bellen|to call", "mailen|to email",
        "afspreken|to meet", "gezellig|cozy", "grapje|joke", "mening|opinion", "pauze|break", "cijfer|grade", "rooster|schedule", "vakantie|holiday", "feestje|party", "uitnodigen|to invite", "ontmoeten|to meet", "leraar|teacher", "leerling|pupil", "klas|class", "examen|exam", "diploma|diploma",
        "ziek|sick", "dokter|doctor", "pijn|pain", "medicijn|medicine", "apotheek|pharmacy", "collega|colleague", "baas|boss", "kantoor|office", "baan|job", "salaris|salary", "solliciteren|to apply", "formulier|form", "afspraak|appointment",
        "buurt|neighborhood", "sleutel|key", "post|mail", "krant|newspaper", "internet|internet", "tuin|garden", "balkon|balcony", "buren|neighbors", "adres|address", "postcode|zip code",
        "station|station", "ticket|ticket", "perron|platform", "vertraging|delay", "bagage|luggage", "paspoort|passport", "hotel|hotel", "vliegveld|airport", "tram|tram", "metro|subway", "taxi|taxi", "verkeer|traffic", "stoplicht|traffic light",
        "goedkoop|cheap", "duur|expensive", "makkelijk|easy", "moeilijk|difficult", "veilig|safe", "gevaarlijk|dangerous", "vroeg|early", "laat|late", "schoon|clean", "vies|dirty", "druk|busy", "rustig|quiet", "interessant|interesting", "saai|boring", "belangrijk|important",
        "omdat|because", "want|for", "tijdens|during", "soms|sometimes", "nooit|never", "altijd|always", "bijna|almost", "misschien|maybe", "straks|later", "vroeger|formerly", "terwijl|while", "dus|so", "ook|also", "nog|yet"
    ],
    "B1": [
        "ervaring|experience", "toekomst|future", "droom|dream", "plan|plan", "doel|goal", "gevolg|consequence", "oorzaak|cause", "verschil|difference", "voordeel|advantage", "nadeel|disadvantage", "oplossing|solution", "probleem|problem", "besluit|decision", "feit|fact", "kans|chance", "risico|risk", "succes|success", "fout|mistake", "verbetering|improvement", "invloed|influence", "resultaat|result", "situatie|situation",
        "verbaasd|surprised", "teleurgesteld|disappointed", "zelfvertrouwen|self-confidence", "twijfelen|to doubt", "beslissen|to decide", "beloven|to promise", "vertrouwen|trust", "klagen|to complain", "feliciteren|to congratulate", "boosheid|anger", "vreugde|joy",
        "nieuws|news", "reclame|advertising", "maatschappij|society", "cultuur|culture", "overheid|government", "wet|law", "belasting|tax", "milieu|environment", "klimaat|climate", "duurzaam|sustainable", "bewust|aware", "verantwoordelijk|responsible", "politiek|politics",
        "verschijnen|to appear", "overtuigen|to convince", "ontdekken|to discover", "herstellen|to recover", "aanpassen|to adapt", "ontwerpen|to design", "adviseren|to advise", "bespreken|to discuss", "veranderen|to change", "negeren|to ignore", "bepalen|to determine",
        "vaardigheid|skill", "opleiding|education", "verslag|report", "presentatie|presentation", "samenwerken|to collaborate", "overleggen|to consult", "organiseren|to organize", "begeleiden|to guide", "advies|advice", "kwaliteit|quality", "discussie|discussion", "interesse|interest", "contact|contact",
        "ingewikkeld|complicated", "duidelijk|clear", "speciaal|special", "gewoon|normal", "ernstig|serious", "vrolijk|cheerful", "voorzichtig|careful", "enthousiast|enthusiastic", "vreemd|strange", "bekend|known", "beroemd|famous", "actueel|current", "uniek|unique",
        "hoewel|although", "ondanks|despite", "tenzij|unless", "mits|provided that", "rekening houden met|to take into account", "deelnemen aan|to participate in", "voorbereiden op|to prepare for", "afhankelijk van|depending on", "in plaats van|instead of"
    ],
    "B2": [
        "analyse|analysis", "onderzoek|research", "theorie|theory", "bron|source", "conclusie|conclusion", "argument|argument", "hypothese|hypothesis", "publiceren|to publish", "definitie|definition", "methode|method", "onderwerp|subject", "data|data", "interpretatie|interpretation", "relevantie|relevance", "bewijs|evidence", "stelling|statement", "toelichting|explanation",
        "strategie|strategy", "doelgroep|target group", "concurrentie|competition", "investering|investment", "omzet|revenue", "onderhandelen|to negotiate", "contract|contract", "winst|profit", "verlies|loss", "groei|growth", "markt|market", "productie|production", "management|management", "leiderschap|leadership", "innovatie|innovation",
        "klimaatverandering|climate change", "diversiteit|diversity", "inclusie|inclusion", "democratie|democracy", "welvaart|prosperity", "rechtvaardigheid|justice", "integratie|integration", "migratie|migration", "globalisering|globalization", "digitalisering|digitalization", "infrastructuur|infrastructure",
        "subtiel|subtle", "concreet|concrete", "abstract|abstract", "relevant|relevant", "cruciaal|crucial", "efficiënt|efficient", "effectief|effective", "complex|complex", "uitgebreid|extensive", "beperkt|limited", "uitstekend|excellent", "specifiek|specific", "essentieel|essential", "capaciteit|capacity", "functionaliteit|functionality",
        "implementeren|to implement", "stimuleren|to stimulate", "voorkomen|to prevent", "bevestigen|to confirm", "ontkennen|to deny", "beoordelen|to assess", "vaststellen|to establish", "veronderstellen|to assume", "benadrukken|to emphasize", "realiseren|to realize", "waarderen|to appreciate", "hanteren|to handle", "toepassen|to apply",
        "derhalve|therefore", "niettemin|nevertheless", "desalniettemin|nonetheless", "evenwel|however", "overigens|moreover", "aanvankelijk|initially", "uiteindelijk|eventually", "enerzijds|on the one hand", "anderzijds|on the other hand", "zodoende|thus", "interactie|interaction", "netwerk|network", "potentieel|potential"
    ],
    "C1": [
        "welbespraakt|eloquent", "diepgaand|profound", "paradoxaal|paradoxical", "intrinsiek|intrinsic", "arbitrair|arbitrary", "dominant|dominant", "prestigieus|prestigious", "authentiek|authentic", "legitiem|legitimate", "ambigu|ambiguous", "eloquent|eloquent", "subtiliteit|subtlety", "discrepantie|discrepancy", "vitaliteit|vitality",
        "bekritiseren|to criticize", "nuanceren|to nuance", "reflecteren|to reflect", "interpreteren|to interpret", "evalueren|to evaluate", "grondig|thorough", "analytisch|analytical", "synthetiseren|to synthesize", "grondslag|foundation", "veronderstelling|assumption", "redenering|reasoning", "weerleggen|to refute", "beargumenteren|to argue",
        "accuraat|accurate", "nauwkeurig|accurate", "consistent|consistent", "coherent|coherent", "expliciet|explicit", "impliciet|implicit", "triviaal|trivial", "fundamenteel|fundamental", "pragmatisch|pragmatic", "innovatief|innovative", "robuust|robust", "substantieel|substantial", "gradueel|gradual", "transparantie|transparency",
        "anticiperen|to anticipate", "consolideren|to consolidate", "manifesteren|to manifest", "transformeren|to transform", "optimaliseren|to optimize", "faciliteren|to facilitate", "interveniëren|to intervene", "articuleren|to articulate", "handhaven|to maintain", "initiëren|to initiate", "delegeren|to delegate", "coördineren|to coordinate",
        "de puntjes op de i zetten|to cross the t's and dot the i's", "tussen de regels door lezen|to read between the lines", "een oogje in het zeil houden|to keep an eye on things", "de knoop doorhakken|to cut the knot", "met de gebakken peren zitten|to be left holding the baby", "de plank misslaan|to miss the mark", "de overhand hebben|to have the upper hand",
        "paradigma|paradigm", "methodologie|methodology", "epistemologie|epistemology", "bureaucratie|bureaucracy", "soevereiniteit|sovereignty", "consensus|consensus", "dilemma|dilemma", "propositie|proposition", "deductie|deduction", "analogie|analogy", "ideologie|ideology", "integriteit|integrity", "autonomie|autonomy", "synergie|synergy",
        "bijgevolg|consequently", "zodoende|thus", "weliswaar|admittedly", "daarentegen|on the other hand", "desondanks|nevertheless", "inherent|inherent", "evenzeer|equally", "aldus|thus"
    ]
}

lines = []
lines.append("LEXICON_DATA = [")
for level, items in data.items():
    lines.append(f'    # ── {level} ─────────────────────────────────────────────────────────────────')
    for item in items:
        nl, en = item.split("|")
        # Removing quotes to prevent issues
        nl = nl.replace('"', "'")
        en = en.replace('"', "'")
        lines.append(f'    {{"word": "{nl}", "translation": "{en}", "cefr_level": "{level}"}},')

lines.append("]")

with open("/Users/rowaidasaba/Desktop/University/project2-2/personalized-reading-dutch/backend/lexicon_data.py", "w") as f:
    f.write("\n".join(lines) + "\n")
