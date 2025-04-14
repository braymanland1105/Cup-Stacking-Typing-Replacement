document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const screens = {
        start: document.getElementById('start-screen'),
        instructions: document.getElementById('instruction-screen'),
        game: document.getElementById('game-screen'),
        gameOver: document.getElementById('game-over-screen'),
    };
    const overlays = {
        pause: document.getElementById('pause-overlay'),
    };
    const buttons = {
        start: document.getElementById('start-button'),
        play: document.getElementById('play-button'),
        playAgain: document.getElementById('play-again-button'),
        mute: document.getElementById('mute-button'),
        pause: document.getElementById('pause-button'),
        resume: document.getElementById('resume-button'),
        home: document.getElementById('home-button'),
    };
    const ui = {
        timer: document.getElementById('timer'),
        roundCounter: document.getElementById('round-counter'),
        finalTime: document.getElementById('final-time'),
        bestTime: document.getElementById('best-time'),
        muteIcon: buttons.mute.querySelector('img'),
        gameArea: document.getElementById('game-area'),
        leftStackArea: document.getElementById('left-stack-area'),
        rightStackArea: document.getElementById('right-stack-area'),
        instructionBird: document.getElementById('instruction-bird-animation'),
        flyingBird: document.getElementById('flying-bird'),
    };
    const audio = {
        instruction: document.getElementById('audio-instruction'),
        endCard: document.getElementById('audio-end-card'),
        cupStack: document.getElementById('audio-cup-stack'),
        cupRolling: document.getElementById('audio-cup-rolling'),
        buttonClick: document.getElementById('audio-button-click'),
        birdFly: document.getElementById('audio-bird-fly'),
        correctType: document.getElementById('audio-correct-type'),
        incorrectType: document.getElementById('audio-incorrect-type'),
        all: document.querySelectorAll('audio'),
    };

    // --- Game State ---
    const GAME_STATES = { START: 'START', INSTRUCTIONS: 'INSTRUCTIONS', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAME_OVER: 'GAME_OVER' };
    const GAME_PHASES = { STACK_LEFT: 'STACK_LEFT', STACK_RIGHT: 'STACK_RIGHT', UNSTACK_LEFT: 'UNSTACK_LEFT', UNSTACK_RIGHT: 'UNSTACK_RIGHT', TRANSITION: 'TRANSITION' };
    let currentState = GAME_STATES.START;
    let currentPhase = GAME_PHASES.STACK_LEFT;
    let currentRound = 1;
    const MAX_ROUNDS = 4;
    let cupData = [];
    let activeCupDataIndex = -1;
    let timerInterval = null;
    let elapsedTime = 0;
    let isMuted = false;
    let isInputBlocked = false;
    const LETTER_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');

    const CUP_WIDTH = 128;
    const CUP_HEIGHT = 128;
    const LEVEL_OFFSET = 80;
    const CUP_SPACING = 100;
    const BASE_Y_PERCENT = 85;
    const LEFT_STACK_X_PERCENT = 30;
    const RIGHT_STACK_X_PERCENT = 70;
    const CENTER_STACK_X_PERCENT = 50;
    const ANIMATION_DURATION = 700; // Duration for stack/unstack
    const ROLL_ANIMATION_DURATION = 1200; // Duration for rolling off animation
    let flyingBirdInterval = null;

    // --- Helper Function to Determine Level and Position ---
    function getLevelAndPos(totalCupsInStack, stackIndex) {
        let cupsInPreviousLevels = 0; let level = 0;
        while (true) { let cupsInThisLevel = level + 1; if (cupsInPreviousLevels + cupsInThisLevel > stackIndex) { let posInLevel = stackIndex - cupsInPreviousLevels; return { level, posInLevel }; } cupsInPreviousLevels += cupsInThisLevel; level++; if (cupsInPreviousLevels >= totalCupsInStack) { let lastLevel = level -1; let cupsInLastLevel = lastLevel + 1; let posInLastLevel = cupsInLastLevel - 1; console.warn(`getLevelAndPos issue: stackIndex ${stackIndex} out of bounds for ${totalCupsInStack} cups. Returning level ${lastLevel}, pos ${posInLastLevel}`); return { level: lastLevel, posInLevel: posInLastLevel}; } }
    }

    // --- Initialization ---
    function init() {
        console.log("Initializing Game..."); loadBestTime(); setupEventListeners(); showScreen(GAME_STATES.START);
    }

    // --- Screen Management ---
    function showScreen(state) {
        console.log(`showScreen called with state: ${state}`); Object.values(screens).forEach(screen => screen.classList.add('hidden')); Object.values(overlays).forEach(overlay => overlay.classList.add('hidden')); let previousState = currentState; currentState = state; console.log("Transitioning from", previousState, "to state:", currentState);
        switch (state) {
            case GAME_STATES.START: screens.start.classList.remove('hidden'); stopTimer(); elapsedTime = 0; currentRound = 1; clearGameArea(); stopInstructionBirdAnimation(); break;
            case GAME_STATES.INSTRUCTIONS: screens.instructions.classList.remove('hidden'); playAudio(audio.instruction, 0.5); startInstructionBirdAnimation(); break;
            case GAME_STATES.PLAYING: screens.game.classList.remove('hidden'); stopInstructionBirdAnimation();
                if (previousState === GAME_STATES.INSTRUCTIONS || previousState === GAME_STATES.GAME_OVER || previousState === GAME_STATES.START) { startGame(); }
                else if (previousState === GAME_STATES.PAUSED) { startTimer(); cupData.forEach(d => { if (d.cupElement) d.cupElement.style.opacity = '1'; if (d.placeholderElement) { updatePlaceholderVisibility(activeCupDataIndex); d.placeholderElement.style.opacity = d.placeholderElement.classList.contains('visible') ? '1' : '0'; } }); if(activeCupDataIndex !== -1) { const activeData = cupData[activeCupDataIndex]; if(activeData) { const element = activeData.isStacked ? activeData.cupElement : activeData.placeholderElement; if(element) element.style.opacity = '1'; } } } break;
            case GAME_STATES.PAUSED: overlays.pause.classList.remove('hidden'); stopTimer(); screens.game.classList.remove('hidden'); cupData.forEach(d => { if (d.placeholderElement) d.placeholderElement.style.opacity = '0.5'; if (d.cupElement) d.cupElement.style.opacity = '0.5'; }); break;
            case GAME_STATES.GAME_OVER: screens.gameOver.classList.remove('hidden'); stopTimer(); updateScores(); playAudio(audio.endCard); stopInstructionBirdAnimation(); break;
        }
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        console.log("Setting up event listeners..."); buttons.start.addEventListener('click', () => { playAudio(audio.buttonClick); showScreen(GAME_STATES.INSTRUCTIONS); }); buttons.play.addEventListener('click', () => { if (audio.instruction && !audio.instruction.paused) { audio.instruction.pause(); audio.instruction.currentTime = 0; } playAudio(audio.buttonClick); stopInstructionBirdAnimation(); showScreen(GAME_STATES.PLAYING); }); buttons.playAgain.addEventListener('click', () => { playAudio(audio.buttonClick); currentRound = 1; showScreen(GAME_STATES.PLAYING); }); buttons.pause.addEventListener('click', () => { if (currentState === GAME_STATES.PLAYING) { playAudio(audio.buttonClick); showScreen(GAME_STATES.PAUSED); } }); buttons.resume.addEventListener('click', () => { playAudio(audio.buttonClick); showScreen(GAME_STATES.PLAYING); }); buttons.home.addEventListener('click', () => { playAudio(audio.buttonClick); if (currentState === GAME_STATES.PLAYING || currentState === GAME_STATES.PAUSED) { stopTimer(); } showScreen(GAME_STATES.START); }); buttons.mute.addEventListener('click', toggleMute); document.addEventListener('keydown', handleKeyPress);
    }

    // --- Game Logic ---
    function startGame() {
        console.log("Starting Game - Round:", currentRound); clearGameArea(); if (currentRound === 1) { elapsedTime = 0; } updateTimerDisplay(); updateRoundCounter(); cupData = generateCupDataForRound(currentRound); if (cupData.length === 0) { console.warn("No cup data generated for round."); nextRound(); return; } createAndPositionPlaceholders();
        if (cupData.some(d => d.side === 'left' && !d.isStacked)) { currentPhase = GAME_PHASES.STACK_LEFT; } else if (cupData.some(d => d.side === 'right' && !d.isStacked)) { currentPhase = GAME_PHASES.STACK_RIGHT; } else { console.error(" startGame: No cups to stack initially?"); currentPhase = GAME_PHASES.UNSTACK_LEFT; }
        setActiveCup(findNextCupDataIndex());
        if (activeCupDataIndex === -1 && currentPhase !== GAME_PHASES.TRANSITION) { console.log("No active cup found immediately after start, moving phase."); moveToNextPhase(); }
        isInputBlocked = false; console.log("Input UNBLOCKED at start of startGame.");
        if (!timerInterval && currentState === GAME_STATES.PLAYING) { startTimer(); }
    }

    function nextRound() {
        console.log("nextRound called. Current Round:", currentRound); currentRound++; if (currentRound > MAX_ROUNDS) { console.log("Max rounds reached. Moving to GAME_OVER."); showScreen(GAME_STATES.GAME_OVER); }
        else { console.log(`Starting transition to round ${currentRound}`); currentPhase = GAME_PHASES.TRANSITION; isInputBlocked = true; console.log("Input BLOCKED for round transition."); animateCupsRollingOff(() => { console.log("animateCupsRollingOff finished (callback triggered). Calling animateBirdFly."); animateBirdFly(() => { console.log("animateBirdFly finished (callback triggered). Calling startGame."); setTimeout(startGame, 100); }); }); }
    }

    function clearGameArea() {
        console.log("Clearing game area..."); cupData.forEach(data => { data.cupElement?.remove(); data.placeholderElement?.remove(); }); cupData = []; activeCupDataIndex = -1; if (ui.flyingBird) ui.flyingBird.classList.add('hidden'); clearInterval(flyingBirdInterval); flyingBirdInterval = null;
    }

    // --- Cup Generation & Positioning ---
    function getRandomLetters(count) {
        let availableLetters = [...LETTER_POOL]; let chosenLetters = []; for (let i = 0; i < count; i++) { if (availableLetters.length === 0) { availableLetters = [...LETTER_POOL]; } let randIndex = Math.floor(Math.random() * availableLetters.length); chosenLetters.push(availableLetters.splice(randIndex, 1)[0]); } return chosenLetters;
    }

    // In script.js, update the generateCupDataForRound function
function generateCupDataForRound(round) {
    let config = {}; 
    const isSingleStackRound = (round === 3); 
    const cupsForTriangle = (h) => h * (h + 1) / 2;
    
    if (!isSingleStackRound) { 
        // Generate different heights for left and right
        let heightLeft, heightRight;
        do {
            heightLeft = Math.floor(Math.random() * 3) + 2;
            heightRight = Math.floor(Math.random() * 3) + 2;
        } while (heightLeft === heightRight); // Ensure different heights
        
        config = { 
            left: cupsForTriangle(heightLeft), 
            right: cupsForTriangle(heightRight), 
            isSingleStack: false 
        };
    } else { 
        // Existing single-stack code
        let height = Math.floor(Math.random() * 4) + 2;
        let totalCups = cupsForTriangle(height);
        if (Math.random() > 0.5) {
            config = { 
                left: totalCups, 
                right: 0, 
                isSingleStack: true, 
                singleSide: 'left' 
            };
        } else {
            config = { 
                left: 0, 
                right: totalCups, 
                isSingleStack: true, 
                singleSide: 'right' 
            };
        }
    }
    
    console.log(`Round ${round} config: ${JSON.stringify(config)}`);
    const lettersNeeded = config.left + config.right;
    if (lettersNeeded === 0) return [];
    
    const roundLetters = getRandomLetters(lettersNeeded);
    let currentCupData = [];
    let letterIndex = 0;

    for (let i = 0; i < config.left; i++) {
        let { level, posInLevel } = getLevelAndPos(config.left, i);
        if (level === -1) {
            console.error(`Error calculating level/pos for left cup index ${i}`);
            continue;
        }
        currentCupData.push({
            letter: roundLetters[letterIndex++],
            side: 'left',
            color: 'blue',
            stackIndex: i,
            level: level,
            posInLevel: posInLevel,
            isStacked: false,
            placeholderElement: null,
            cupElement: null,
            targetPos: null,
            isSingleStack: config.isSingleStack
        });
    }

    for (let i = 0; i < config.right; i++) {
        let { level, posInLevel } = getLevelAndPos(config.right, i);
        if (level === -1) {
            console.error(`Error calculating level/pos for right cup index ${i}`);
            continue;
        }
        currentCupData.push({
            letter: roundLetters[letterIndex++],
            side: 'right',
            color: 'red',
            stackIndex: i,
            level: level,
            posInLevel: posInLevel,
            isStacked: false,
            placeholderElement: null,
            cupElement: null,
            targetPos: null,
            isSingleStack: config.isSingleStack
        });
    }

    let maxLevelLeft = -1;
    const leftCups = currentCupData.filter(d => d.side === 'left');
    if (leftCups.length > 0) {
        maxLevelLeft = Math.max(...leftCups.map(d => d.level));
    }
    let maxLevelRight = -1;
    const rightCups = currentCupData.filter(d => d.side === 'right');
    if (rightCups.length > 0) {
        maxLevelRight = Math.max(...rightCups.map(d => d.level));
    }
    
    currentCupData.forEach(d => {
        d.maxLevel = d.side === 'left' ? maxLevelLeft : maxLevelRight;
    });
    
    console.log("Generated cup data:", currentCupData.map(d => `${d.letter}(${d.side}-${d.stackIndex}-L${d.level})`));
    return currentCupData;
}


    function createAndPositionPlaceholders() {
        console.log("Creating placeholders..."); const gameAreaRect = ui.gameArea.getBoundingClientRect(); if (!gameAreaRect || gameAreaRect.width === 0 || gameAreaRect.height === 0) { requestAnimationFrame(createAndPositionPlaceholders); return; }
        cupData.forEach(data => { data.targetPos = calculateStackPosition(data, gameAreaRect); const placeholder = document.createElement('div'); placeholder.classList.add('cup-placeholder'); placeholder.style.left = `${data.targetPos.x}px`; placeholder.style.top = `${data.targetPos.y}px`; const letterEl = document.createElement('span'); letterEl.classList.add('cup-letter'); letterEl.textContent = data.letter; placeholder.appendChild(letterEl); data.placeholderElement = placeholder; ui.gameArea.appendChild(placeholder); });
        console.log("Placeholders created."); updatePlaceholderVisibility(activeCupDataIndex);
    }

    function calculateStackPosition(cupInfo, gameAreaRect) {
         let stackCenterXPercent; if (cupInfo.isSingleStack) { stackCenterXPercent = CENTER_STACK_X_PERCENT; } else { stackCenterXPercent = cupInfo.side === 'left' ? LEFT_STACK_X_PERCENT : RIGHT_STACK_X_PERCENT; } const stackCenterX = gameAreaRect.width * (stackCenterXPercent / 100); const baseY = gameAreaRect.height * (BASE_Y_PERCENT / 100) - CUP_HEIGHT; const y = baseY - (cupInfo.maxLevel - cupInfo.level) * LEVEL_OFFSET; const cupsInThisLevel = cupInfo.level + 1; const levelWidth = (cupsInThisLevel - 1) * CUP_SPACING; const startXThisLevel = stackCenterX - levelWidth / 2; const x = startXThisLevel + cupInfo.posInLevel * CUP_SPACING; const targetX = x - CUP_WIDTH / 2; const targetY = y; return { x: targetX, y: targetY };
    }

    function updatePlaceholderVisibility(activeIndex) {
        if (!cupData || cupData.length === 0) return; const isStackingPhase = (currentPhase === GAME_PHASES.STACK_LEFT || currentPhase === GAME_PHASES.STACK_RIGHT); let activeLevel = -1; let activeSide = null; let activeElement = null;
        if (activeIndex >= 0 && activeIndex < cupData.length) { const activeData = cupData[activeIndex]; if (activeData) { if (isStackingPhase && !activeData.isStacked) { activeLevel = activeData.level; activeSide = activeData.side; activeElement = activeData.placeholderElement; } else if (!isStackingPhase && activeData.isStacked) { activeLevel = activeData.level; activeSide = activeData.side; activeElement = activeData.cupElement; } } else { activeIndex = -1; } }
        cupData.forEach(d => { if (d.placeholderElement) { if (isStackingPhase && d.side === activeSide && d.level === activeLevel && !d.isStacked) { d.placeholderElement.classList.add('visible'); d.placeholderElement.style.opacity = '1'; } else { d.placeholderElement.classList.remove('visible'); d.placeholderElement.style.opacity = '0'; d.placeholderElement.classList.remove('active'); } } if (d.cupElement && d.cupElement !== activeElement) { d.cupElement.classList.remove('active'); } }); if (activeElement) { activeElement.classList.add('active'); }
    }

    // --- Active Cup Management ---
     function setActiveCup(index) {
          if (activeCupDataIndex >= 0 && activeCupDataIndex < cupData.length) { const prevData = cupData[activeCupDataIndex]; if (prevData) { if(prevData.cupElement) prevData.cupElement.classList.remove('active'); if(prevData.placeholderElement) prevData.placeholderElement.classList.remove('active'); } } activeCupDataIndex = index; updatePlaceholderVisibility(activeCupDataIndex); if (activeCupDataIndex === -1 && currentState === GAME_STATES.PLAYING && currentPhase !== GAME_PHASES.TRANSITION) { console.log("No active cup found by setActiveCup, trying to move to next phase..."); setTimeout(moveToNextPhase, 50); }
    }

    // --- findNextCupDataIndex (Stack Bottom-Up, Left-Right; Unstack Top-Down, Left-Right) ---
    function findNextCupDataIndex(forPhase = currentPhase) {
        let targetIndex = -1; const isStacking = (forPhase === GAME_PHASES.STACK_LEFT || forPhase === GAME_PHASES.STACK_RIGHT); const targetSide = (forPhase === GAME_PHASES.STACK_LEFT || forPhase === GAME_PHASES.UNSTACK_LEFT) ? 'left' : 'right';
        const relevantCups = cupData.filter(d => d.side === targetSide && (isStacking ? !d.isStacked : d.isStacked));
        if (relevantCups.length > 0) { let targetLevel; if (isStacking) { targetLevel = Math.max(...relevantCups.map(d => d.level)); } else { targetLevel = Math.min(...relevantCups.map(d => d.level)); } const cupsInTargetLevel = relevantCups.filter(d => d.level === targetLevel); if (cupsInTargetLevel.length > 0) { let targetPosInLevel = Math.min(...cupsInTargetLevel.map(d => d.posInLevel)); const targetCup = cupsInTargetLevel.find(d => d.posInLevel === targetPosInLevel); if (targetCup) { targetIndex = cupData.indexOf(targetCup); } } }
        return targetIndex;
    }

    // --- REWRITTEN: moveToNextPhase (Simplified Logic) ---
    function moveToNextPhase() {
        let originalPhase = currentPhase;
        let nextCupIndex = -1;
        let potentialNextPhase = originalPhase;

        console.log(`Entering moveToNextPhase from phase: ${originalPhase}`);
        if (originalPhase === GAME_PHASES.TRANSITION) { console.log("In TRANSITION phase, exiting moveToNextPhase."); return; }

        // 1. Check if there are still cups left in the CURRENT phase/side
        nextCupIndex = findNextCupDataIndex(originalPhase);

        // 2. If no cups left in the current phase, determine the next logical phase
        if (nextCupIndex === -1) {
            console.log(`Phase ${originalPhase} appears complete. Determining next logical phase.`);
            switch (originalPhase) {
                case GAME_PHASES.STACK_LEFT:  potentialNextPhase = GAME_PHASES.STACK_RIGHT; break;
                case GAME_PHASES.STACK_RIGHT: potentialNextPhase = GAME_PHASES.UNSTACK_LEFT; break;
                case GAME_PHASES.UNSTACK_LEFT: potentialNextPhase = GAME_PHASES.UNSTACK_RIGHT; break;
                case GAME_PHASES.UNSTACK_RIGHT: console.log("UNSTACK_RIGHT finished. Round should end."); nextRound(); return; // End of sequence
            }
            console.log(`Potential next phase is ${potentialNextPhase}. Checking for cups...`);
            // 3. Check if there are cups available in the potential next phase
            nextCupIndex = findNextCupDataIndex(potentialNextPhase);

            // 4. If no cups in the potential next phase either, advance phase AGAIN (skip empty phases)
            if (nextCupIndex === -1) {
                 console.log(`Potential phase ${potentialNextPhase} is also empty. Skipping.`);
                 let phaseAfterSkip = potentialNextPhase;
                 // Determine phase after skip
                 if (potentialNextPhase === GAME_PHASES.STACK_RIGHT) { phaseAfterSkip = GAME_PHASES.UNSTACK_LEFT; }
                 else if (potentialNextPhase === GAME_PHASES.UNSTACK_LEFT) { phaseAfterSkip = GAME_PHASES.UNSTACK_RIGHT; }
                 else if (potentialNextPhase === GAME_PHASES.UNSTACK_RIGHT) { // Should have been caught above, but safety check
                     console.log("Skipped through phases, ending on UNSTACK_RIGHT check. Round should end."); nextRound(); return;
                 }
                 potentialNextPhase = phaseAfterSkip; // Update potential phase after skip
                 console.log(`Potential phase after skip is ${potentialNextPhase}. Checking for cups...`);
                 nextCupIndex = findNextCupDataIndex(potentialNextPhase); // Check again

                 // If still no cups after skipping, end the round (should only happen if UNSTACK_RIGHT was skipped and empty)
                 if (nextCupIndex === -1 && potentialNextPhase === GAME_PHASES.UNSTACK_RIGHT) {
                      console.log("After skipping phases, UNSTACK_RIGHT is empty. Ending round."); nextRound(); return;
                 } else if (nextCupIndex === -1) {
                      console.error(`State Error: Skipped phases, ended on ${potentialNextPhase}, no cup found!`);
                      nextRound(); return; // Force end as fallback
                 }
            }
            // 5. If we found a cup in a new phase (original or skipped-to), update the currentPhase
            console.log(`Phase changing from ${originalPhase} to ${potentialNextPhase}.`);
            currentPhase = potentialNextPhase;
        }

        // 6. Set the active cup
        setActiveCup(nextCupIndex);

        // 7. Unblock input ONLY if we found a valid next cup
        if (nextCupIndex !== -1) {
            console.log(`moveToNextPhase found next cup index ${nextCupIndex}. Input UNBLOCKED.`); isInputBlocked = false;
        } else {
            console.log(`moveToNextPhase did NOT find a valid next cup index. Input remains BLOCKED (or will be handled by nextRound).`);
             // If -1, it means either nextRound was called OR setActiveCup will call moveToNextPhase again shortly.
             // Input should remain blocked in these cases until startGame unblocks it.
        }
    }
    // --- END REWRITTEN: moveToNextPhase ---


    // --- Input Handling ---
    function handleKeyPress(event) {
        if (currentState !== GAME_STATES.PLAYING || isInputBlocked || activeCupDataIndex === -1) { return; } const pressedKey = event.key.toUpperCase(); if (!LETTER_POOL.includes(pressedKey)) return; const activeData = cupData[activeCupDataIndex]; if (!activeData) { console.error("handleKeyPress: No active data for index", activeCupDataIndex); return; } const isUnstacking = activeData.isStacked; const targetElement = isUnstacking ? activeData.cupElement : activeData.placeholderElement; const targetLetterElement = targetElement?.querySelector('.cup-letter'); if (!targetElement) { console.error("handleKeyPress: Target element not found for", activeData.letter); return; }
        if (pressedKey === activeData.letter) { // Correct Key
            isInputBlocked = true; console.log(`Input BLOCKED by correct keypress for ${activeData.letter}`); playAudio(audio.correctType); if (targetLetterElement) { const flashClass = isUnstacking ? 'flash-green-cup' : 'flash-green-placeholder'; targetLetterElement.classList.add(flashClass); setTimeout(() => targetLetterElement?.classList.remove(flashClass), 150); }
            if (!isUnstacking) { createAndAnimateCupToStack(activeData); } else { animateCupUnstack(activeData); }
            setTimeout(moveToNextPhase, 10); // Small delay before moving phase
        } else { // Incorrect Key
            isInputBlocked = true; console.log("Input BLOCKED by incorrect keypress."); playAudio(audio.incorrectType); targetElement.classList.add('shake'); if (targetLetterElement) { const flashClass = isUnstacking ? 'flash-red-cup' : 'flash-red-placeholder'; targetLetterElement.classList.add(flashClass); setTimeout(() => targetLetterElement?.classList.remove(flashClass), 200); }
            setTimeout(() => { targetElement?.classList.remove('shake'); isInputBlocked = false; console.log("Input UNBLOCKED after incorrect key shake."); }, 300);
        }
    }

    // --- Animations (Do not block next input) ---
    function createAndAnimateCupToStack(data) {
        data.placeholderElement?.remove(); data.placeholderElement = null; const cupElement = document.createElement('div'); cupElement.classList.add('cup', data.color); cupElement.dataset.letter = data.letter; const letterElement = document.createElement('span'); letterElement.classList.add('cup-letter'); letterElement.textContent = data.letter; cupElement.appendChild(letterElement); data.cupElement = cupElement; const stagingArea = document.getElementById('cup-staging-area'); const stagingRect = stagingArea.getBoundingClientRect(); const gameAreaRect = ui.gameArea.getBoundingClientRect(); const initialX = stagingRect.left + Math.random() * (stagingRect.width - CUP_WIDTH); const initialY = gameAreaRect.height; cupElement.style.left = `${initialX}px`; cupElement.style.top = `${initialY}px`; cupElement.style.transform = `rotate(${Math.random() * 60 - 30}deg) scale(0.8)`; cupElement.style.opacity = '0'; cupElement.style.zIndex = '10'; ui.gameArea.appendChild(cupElement); void cupElement.offsetWidth; cupElement.classList.add('animating-stack'); if (!data.targetPos) { console.error("Missing targetPos", data.letter); data.targetPos = calculateStackPosition(data, gameAreaRect); if(!data.targetPos) { cupElement.remove(); return; } } cupElement.style.left = `${data.targetPos.x}px`; cupElement.style.top = `${data.targetPos.y}px`; cupElement.style.transform = 'rotate(0deg) scale(1)'; cupElement.style.opacity = '1'; playAudio(audio.cupStack); data.isStacked = true; setTimeout(() => { if (!data.cupElement) return; data.cupElement.classList.remove('animating-stack'); data.cupElement.classList.add('stacked'); data.cupElement.style.zIndex = `${5 + (data.maxLevel - data.level)}`; }, ANIMATION_DURATION);
    }

    function animateCupUnstack(data) {
         const cupElement = data.cupElement; data.isStacked = false; data.cupElement = null; if (!cupElement) { console.warn("animateCupUnstack called with no cupElement ref for", data.letter); return; } const gameAreaRect = ui.gameArea.getBoundingClientRect(); const targetX = -CUP_WIDTH * 1.5; const currentY = data.targetPos ? data.targetPos.y : parseFloat(cupElement.style.top || '0'); const targetY = currentY + (Math.random() * 100 - 50); data.placeholderElement?.remove(); data.placeholderElement = null; cupElement.classList.remove('stacked', 'active'); cupElement.classList.add('animating-unstack'); cupElement.style.zIndex = '4'; cupElement.style.left = `${targetX}px`; cupElement.style.top = `${targetY}px`; cupElement.style.transform = `rotate(${Math.random() * -270 - 90}deg) scale(0.7)`; cupElement.style.opacity = '0'; playAudio(audio.cupStack); setTimeout(() => { if(cupElement && cupElement.parentNode) { cupElement.remove(); } }, ANIMATION_DURATION);
    }

    // --- SIMPLIFIED: animateCupsRollingOff (Using single Timeout) ---
    function animateCupsRollingOff(callback) {
        console.log("Starting animateCupsRollingOff (Simplified Timeout Logic)");
        playAudio(audio.cupRolling);
        const offscreenX = -CUP_WIDTH * 2;
        const rollDuration = ROLL_ANIMATION_DURATION; // Use constant
        // Find cup elements currently in the DOM that might need removal
        const domCups = Array.from(ui.gameArea.querySelectorAll('.cup'));
        const cupsToAnimate = domCups.length;

        console.log(`Found ${cupsToAnimate} cups to animate rolling off.`);

        if (cupsToAnimate === 0) {
             console.log("No cups to roll off, calling callback immediately.");
             if (callback) { setTimeout(callback, 10); } // Call callback async
             return;
        }

        const gameAreaRect = ui.gameArea.getBoundingClientRect();

        // Start animation for all cups
        domCups.forEach((cupElement, index) => {
             requestAnimationFrame(() => { // Ensure styles apply before animation
                 if (!cupElement || !cupElement.parentNode) return;

                 cupElement.classList.remove('stacked', 'active', 'unstacked', 'animating-stack', 'animating-unstack');
                 cupElement.classList.add('rolling-off');
                 cupElement.style.zIndex = `${3 + index}`;
                 // Apply transition *before* changing styles
                 cupElement.style.transition = `transform ${rollDuration / 1000}s ease-in, left ${rollDuration / 1000}s ease-in, opacity ${rollDuration / 1000}s ease-in, top ${rollDuration / 1000}s ease-in`;

                 const currentRect = cupElement.getBoundingClientRect();
                 const currentTop = currentRect.top - gameAreaRect.top;
                 const currentTransform = getComputedStyle(cupElement).transform;
                 let currentRotation = 0;
                  try { const matrix = new DOMMatrixReadOnly.fromMatrix(currentTransform); currentRotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI); } catch(e) {}

                  // Apply target styles in next frame
                  requestAnimationFrame(() => {
                     if (!cupElement || !cupElement.parentNode) return;
                     cupElement.style.left = `${offscreenX}px`;
                     cupElement.style.top = `${currentTop + Math.random() * 50 - 25}px`;
                     cupElement.style.transform = `rotate(${(currentRotation - 360 - Math.random() * 360)}deg) scale(0.8)`;
                     cupElement.style.opacity = '0';
                  });
             });
        });

        // Set ONE timeout to clean up and call the callback
        setTimeout(() => {
             console.log(`animateCupsRollingOff timeout reached after ${rollDuration}ms.`);
             // Remove all the cups that were supposed to animate
             domCups.forEach(cupElement => {
                  if (cupElement && cupElement.parentNode) {
                     cupElement.remove();
                  }
             });
             // Nullify references in cupData (important for state checks)
             cupData.forEach(d => { d.cupElement = null; });

             console.log("All rolling cups removed. Calling final callback.");
             if (callback) {
                 callback();
             } else {
                  console.warn("animateCupsRollingOff finished but no callback provided.");
             }
        }, rollDuration + 100); // Add a small buffer to ensure animation visually finishes
    }
    // --- END SIMPLIFIED: animateCupsRollingOff ---


    // --- Bird Animations ---
    function startInstructionBirdAnimation() {
        if (ui.instructionBird) { ui.instructionBird.style.backgroundPosition = `-150px -192px`; console.log("Started instruction bird animation"); } else { console.warn("Instruction bird element not found for animation start."); }
    }
    function stopInstructionBirdAnimation() {
         if (ui.instructionBird) { ui.instructionBird.style.backgroundPosition = `0 0`; console.log("Stopped instruction bird animation"); } else { console.warn("Instruction bird element not found for animation stop."); }
    }

    // --- animateBirdFly (Logging) ---
    function animateBirdFly(callback) {
        console.log("Starting animateBirdFly"); if (!audio.birdFly || !ui.flyingBird) { console.error("Bird fly audio or element not found! Skipping bird animation."); if (callback) setTimeout(callback, 50); return; }
        if (!isMuted) { audio.birdFly.loop = true; audio.birdFly.volume = 1; audio.birdFly.play().catch(e => console.warn(`Audio birdFly loop failed:`, e.message)); }
        ui.flyingBird.classList.remove('hidden'); const gameAreaRect = ui.gameArea.getBoundingClientRect(); const birdWidth = ui.flyingBird.offsetWidth || 150; const startX = gameAreaRect.width; const endX = -birdWidth; const startY = gameAreaRect.height * 0.25; const flightDuration = 2500; const birdFPS = 10; let birdAnimationTimeout = null;
        ui.flyingBird.style.transition = 'none'; ui.flyingBird.style.transform = `translateX(${startX}px) translateY(${startY}px) scaleX(1)`; ui.flyingBird.style.backgroundPosition = `0 0`; let birdFrame = 0;
        clearInterval(flyingBirdInterval); flyingBirdInterval = setInterval(() => { birdFrame = (birdFrame + 1) % 2; const frameX = birdFrame * -150; ui.flyingBird.style.backgroundPosition = `${frameX}px 0px`; }, 1000 / birdFPS);
          setTimeout(() => { if (ui.flyingBird) { ui.flyingBird.style.transition = `transform ${flightDuration / 1000}s linear`; ui.flyingBird.style.transform = `translateX(${endX}px) translateY(${startY - gameAreaRect.height * 0.05}px) scaleX(1)`; } }, 20);
         if (birdAnimationTimeout) clearTimeout(birdAnimationTimeout);
        birdAnimationTimeout = setTimeout(() => { console.log("animateBirdFly timeout reached. Cleaning up."); clearInterval(flyingBirdInterval); flyingBirdInterval = null; birdAnimationTimeout = null; if (audio.birdFly) { audio.birdFly.loop = false; audio.birdFly.pause(); audio.birdFly.currentTime = 0; } if (ui.flyingBird) { ui.flyingBird.classList.add('hidden'); ui.flyingBird.style.transition = 'none'; } if (callback) { console.log("Calling animateBirdFly callback."); callback(); } else { console.warn("animateBirdFly finished but no callback provided."); } }, flightDuration + 100);
    }

    // --- Timer & Scoring ---
    function startTimer() {
        if (timerInterval) return; elapsedTime = Number(elapsedTime) || 0; const startTime = Date.now() - elapsedTime * 1000; timerInterval = setInterval(() => { elapsedTime = (Date.now() - startTime) / 1000; updateTimerDisplay(); }, 100);
    }
    function stopTimer() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }
    function updateTimerDisplay() {
        ui.timer.textContent = elapsedTime.toFixed(1);
    }
    function updateRoundCounter() {
        ui.roundCounter.textContent = `${currentRound}/${MAX_ROUNDS}`;
    }
    function updateScores() {
        const currentTime = parseFloat(elapsedTime.toFixed(1)); ui.finalTime.textContent = `YOUR TIME: ${currentTime} SECONDS`; const bestTime = loadBestTime(); if (bestTime === null || currentTime < bestTime) { saveBestTime(currentTime); ui.bestTime.textContent = `NEW BEST TIME: ${currentTime} SECONDS`; } else { ui.bestTime.textContent = `BEST TIME: ${bestTime} SECONDS`; }
    }
    function saveBestTime(time) {
        try { localStorage.setItem('cupStackTypingBestTime', time); } catch (e) { console.error("LS Error saving best time:", e); }
    }
    function loadBestTime() {
        try { const bt = localStorage.getItem('cupStackTypingBestTime'); return bt ? parseFloat(bt) : null; } catch (e) { console.error("LS Error loading best time:", e); return null; }
    }

    // --- Audio Control ---
    function playAudio(audioElement, volume = 1) {
        if (!isMuted && audioElement) {
            // Clone the audio element to allow overlapping
            const clonedAudio = audioElement.cloneNode(true);
            clonedAudio.volume = Math.max(0, Math.min(1, volume));
            clonedAudio.play().catch(e => {
                if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
                    console.warn(`Audio play failed:`, e.message);
                }
            });
        }
    }
    function toggleMute() {
        isMuted = !isMuted; console.log("Muted:", isMuted); audio.all.forEach(aud => aud.muted = isMuted); ui.muteIcon.src = isMuted ? 'assets/ui/Muted.png' : 'assets/ui/Unmuted.png'; if (audio.buttonClick) { playAudio(audio.buttonClick); }
    }

    // --- Run Initialization ---
    init();
});