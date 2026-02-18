export const parseCard = (cardString) => {
    // Expected format: "Value of Suit" (e.g., "Ace of Spades", "7 of Hearts")
    // OR short format "AS", "7H" depending on backend.

    // Let's check backend format: gameEngine.js says: `${value} of ${suit}`
    // e.g., "King of Spades", "7 of Hearts"

    if (!cardString) return { value: '', suit: '', color: 'text-black' };

    const parts = cardString.split(' of ');
    const value = parts[0];
    const suit = parts[1];

    let shortValue = value;
    if (value === 'Ace') shortValue = 'A';
    else if (value === 'King') shortValue = 'K';
    else if (value === 'Queen') shortValue = 'Q';
    else if (value === 'Jack') shortValue = 'J';

    let suitIcon = '';
    let color = 'text-black';

    switch (suit) {
        case 'Spades':
            suitIcon = 'spades'; // Material Symbol name
            color = 'text-black';
            break;
        case 'Hearts':
            suitIcon = 'favorite'; // Material Symbol for Heart
            color = 'text-red-600';
            break;
        case 'Diamonds':
            suitIcon = 'diamond';
            color = 'text-red-600';
            break;
        case 'Clubs':
            suitIcon = 'playing_cards'; // Closest match or custom SVG needed. 
            // Material Symbols "clubs" doesn't exist perfectly, "playing_cards" is generic.
            // Actually, Material Symbols has specific suit icons in newer versions, 
            // but let's stick to the mockup's usage. 
            // Mockup used 'diamond' and 'favorite'. 
            // For Clubs/Spades, let's use text entities if needed or generic icons.
            // Let's try to map to standard unicode for visual accuracy if icons fail.
            // But mockup uses Material Symbols.
            // Let's use:
            // Spades -> 'spades' (if available) or 'cloud' (lol no) -> 'keyboard_arrow_up' looks like spade tip? 
            // No, getting specific font icons is safer. 
            // Let's assume the user has the font that supports 'spades', 'clubs', 'diamond', 'heart'.
            // Material Symbols usually supports 'diamond' and 'favorite' (heart). 
            // 'clubs' and 'spades' might be missing.
            // I'll use Unicode characters for the suit icon inside the HTML to be safe.
            suitIcon = '♣️'; // Fallback
            if (suit === 'Clubs') suitIcon = 'stat_0'; // just kidding.
            break;
    }

    // Actually, looking at the mockup HTML:
    // They used `diamond` and `favorite` (heart).
    // For spades/clubs they might have used `playing_cards` or similar.
    // I will use Unicode chars ♠ ♥ ♦ ♣ ensuring color is correct.
    // It's robust and looks good.

    const suitChar = {
        'Spades': '♠',
        'Hearts': '♥',
        'Diamonds': '♦',
        'Clubs': '♣'
    }[suit];

    return { shortValue, suitChar, color, fullValue: value };
};
