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
    let instructionAudioClone = null;

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
    const ANIMATION_DURATION = 700;
    const ROLL_ANIMATION_DURATION = 1200;
    let flyingBirdInterval = null;
    let unstackedYLevel = 0; // Stores the fixed Y level for unstacked cups

    // --- Helper Function to Determine Level and Position ---
    function getLevelAndPos(totalCupsInStack, stackIndex) {
        let cupsInPreviousLevels = 0;
        let level = 0;
        while (true) {
            let cupsInThisLevel = level + 1;
            if (cupsInPreviousLevels + cupsInThisLevel > stackIndex) {
                let posInLevel = stackIndex - cupsInPreviousLevels;
                return { level, posInLevel };
            }
            cupsInPreviousLevels += cupsInThisLevel;
            level++;
            if (cupsInPreviousLevels >= totalCupsInStack) {
                // Fallback for indices somehow out of bounds (shouldn't happen if totalCupsInStack is correct)
                let lastLevel = level -1;
                let cupsInLastLevel = lastLevel + 1;
                let posInLastLevel = cupsInLastLevel - 1;
                console.warn(`getLevelAndPos issue: stackIndex ${stackIndex} out of bounds for ${totalCupsInStack} cups. Returning level ${lastLevel}, pos ${posInLastLevel}`);
                return { level: lastLevel, posInLevel: posInLastLevel};
            }
        }
    }

    // --- Initialization ---
    function init() {
        console.log("Initializing Game...");
        loadBestTime();
        setupEventListeners();
        showScreen(GAME_STATES.START);
    }

    // --- Screen Management ---
    function showScreen(state) {
        console.log(`showScreen called with state: ${state}`);
        Object.values(screens).forEach(screen => screen.classList.add('hidden'));
        Object.values(overlays).forEach(overlay => overlay.classList.add('hidden'));
        let previousState = currentState;
        currentState = state;
        console.log("Transitioning from", previousState, "to state:", currentState);

        switch (state) {
            case GAME_STATES.START:
                screens.start.classList.remove('hidden');
                stopTimer();
                elapsedTime = 0;
                currentRound = 1;
                clearGameArea();
                stopInstructionBirdAnimation();
                break;
            case GAME_STATES.INSTRUCTIONS:
                screens.instructions.classList.remove('hidden');
                instructionAudioClone = playAudio(audio.instruction, 0.5);
                startInstructionBirdAnimation();
                break;
            case GAME_STATES.PLAYING:
                screens.game.classList.remove('hidden');
                stopInstructionBirdAnimation();
                // If coming from a non-game state, start a new game
                if (previousState === GAME_STATES.INSTRUCTIONS || previousState === GAME_STATES.GAME_OVER || previousState === GAME_STATES.START) {
                    startGame();
                }
                // If coming from pause, ensure elements are visible
                else if (previousState === GAME_STATES.PAUSED) {
                    startTimer();
                    // Ensure opacity is reset after pause overlay is hidden
                    cupData.forEach(d => {
                        if (d.cupElement) d.cupElement.style.opacity = '1';
                        if (d.placeholderElement) {
                             // Re-evaluate visibility based on current active cup
                             updatePlaceholderVisibility(activeCupDataIndex);
                            d.placeholderElement.style.opacity = d.placeholderElement.classList.contains('visible') ? '1' : '0';
                        }
                    });
                     // Explicitly make the active element visible if it exists
                    if(activeCupDataIndex !== -1) {
                       const activeData = cupData[activeCupDataIndex];
                       if(activeData) {
                           const element = activeData.isStacked ? activeData.cupElement : activeData.placeholderElement;
                           if(element) element.style.opacity = '1';
                       }
                    }
                }
                break;
            case GAME_STATES.PAUSED:
                overlays.pause.classList.remove('hidden');
                stopTimer();
                 // Keep game screen visible behind overlay
                screens.game.classList.remove('hidden');
                // Slightly dim game elements
                 cupData.forEach(d => {
                    if (d.placeholderElement) d.placeholderElement.style.opacity = '0.5';
                    if (d.cupElement) d.cupElement.style.opacity = '0.5';
                });
                // Update placeholder visibility to only show the active row while dimmed
                updatePlaceholderVisibility(activeCupDataIndex);
                break;
            case GAME_STATES.GAME_OVER:
                screens.gameOver.classList.remove('hidden');
                stopTimer();
                updateScores();
                playAudio(audio.endCard);
                stopInstructionBirdAnimation(); // Ensure instruction bird is off
                break;
        }
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");
        buttons.start.addEventListener('click', () => {
            playAudio(audio.buttonClick);
            showScreen(GAME_STATES.INSTRUCTIONS);
        });
        buttons.play.addEventListener('click', () => {
            if (instructionAudioClone && !instructionAudioClone.paused) {
                instructionAudioClone.pause();
                instructionAudioClone.currentTime = 0; // Reset audio for next time
            }
            playAudio(audio.buttonClick);
            stopInstructionBirdAnimation(); // Ensure instruction bird is off when game starts
            showScreen(GAME_STATES.PLAYING);
        });
        buttons.playAgain.addEventListener('click', () => {
            playAudio(audio.buttonClick);
            currentRound = 1; // Reset round for a new game
            showScreen(GAME_STATES.PLAYING);
        });
        buttons.pause.addEventListener('click', () => {
            if (currentState === GAME_STATES.PLAYING) { // Only allow pausing when actually playing
                playAudio(audio.buttonClick);
                showScreen(GAME_STATES.PAUSED);
            }
        });
        buttons.resume.addEventListener('click', () => {
            playAudio(audio.buttonClick);
            showScreen(GAME_STATES.PLAYING);
        });
        buttons.home.addEventListener('click', () => {
            playAudio(audio.buttonClick);
             // Stop timer if returning from a state where it might be running
            if (currentState === GAME_STATES.PLAYING || currentState === GAME_STATES.PAUSED) {
                 stopTimer();
            }
            showScreen(GAME_STATES.START);
        });
        buttons.mute.addEventListener('click', toggleMute);

        document.addEventListener('keydown', handleKeyPress);
    }

    // --- Game Logic ---
    function startGame() {
        console.log("Starting Game - Round:", currentRound);
        clearGameArea(); // Remove old cups and placeholders
        if (currentRound === 1) { // Reset time only on the first round of a new game
            elapsedTime = 0;
        }
        updateTimerDisplay();
        updateRoundCounter();
        cupData = generateCupDataForRound(currentRound);

        if (cupData.length === 0) {
            console.warn("No cup data generated for round.");
            // If no cups generated, immediately try to move to the next round (or game over)
            nextRound();
            return;
        }

        createAndPositionPlaceholders(); // Set up the target locations

        // Calculate the fixed Y level for unstacked cups
        // Determine the Y position of the lowest row of the tallest possible stack (5 cups high, maxLevel = 4)
        const gameAreaRect = ui.gameArea.getBoundingClientRect();
        if (!gameAreaRect || gameAreaRect.height === 0) {
             console.warn("Game area not ready, cannot calculate unstackedYLevel.");
             unstackedYLevel = 0; // Fallback
        } else {
            // Create a dummy cupInfo object representing the lowest cup of a 5-cup stack
            const dummyCupInfo = {
                level: 4, // Level 4 is the lowest row (base) of a 5-cup stack (levels 0 to 4)
                maxLevel: 4, // Max level for a 5-cup stack
                side: 'left', // Side doesn't affect Y calculation based on maxLevel
                isSingleStack: true, // Single stack doesn't affect Y based on maxLevel
                // Other properties like letter, stackIndex, posInLevel are not needed for Y calc
            };
            const lowestCupY = calculateStackPosition(dummyCupInfo, gameAreaRect).y;
            unstackedYLevel = lowestCupY - 80; // Add the desired offset (-80)
            console.log("Calculated fixed unstackedYLevel:", unstackedYLevel);
        }


        // Determine the initial phase based on generated cup data
        if (cupData.some(d => d.side === 'left' && !d.isStacked)) {
            currentPhase = GAME_PHASES.STACK_LEFT;
        } else if (cupData.some(d => d.side === 'right' && !d.isStacked)) {
            currentPhase = GAME_PHASES.STACK_RIGHT;
        } else {
            // Should not happen in normal gameplay if cups were generated
            console.error(" startGame: No cups to stack initially? Assuming unstacking phase.");
            currentPhase = GAME_PHASES.UNSTACK_LEFT; // Or handle as an error/transition?
        }

        // Find and set the first active cup
        setActiveCup(findNextCupDataIndex());

        // If no active cup was found immediately (e.g., generated empty phase), try moving phase
        if (activeCupDataIndex === -1 && currentState === GAME_STATES.PLAYING && currentPhase !== GAME_PHASES.TRANSITION) {
             console.log("No active cup found immediately after start, moving phase.");
             moveToNextPhase();
        }


        isInputBlocked = false; // Unblock input once game is ready
        console.log("Input UNBLOCKED at start of startGame.");

        // Start the timer if not already running and in the playing state
        if (!timerInterval && currentState === GAME_STATES.PLAYING) {
             startTimer();
        }
    }

    function nextRound() {
        console.log("nextRound called. Current Round:", currentRound);
        currentRound++;

        let animationsCompleted = 0;
        const animationsToComplete = 2; // Bird and Cups

        const animationCompleteCallback = () => {
            animationsCompleted++;
            if (animationsCompleted === animationsToComplete) {
                console.log("All transition animations finished.");
                // Check if it was the last round's transition
                if (currentRound > MAX_ROUNDS) {
                    console.log("Max rounds reached after animations. Moving to GAME_OVER.");
                    showScreen(GAME_STATES.GAME_OVER); // Show game over screen after animations
                } else {
                    console.log("Animations finished, starting next round.");
                    setTimeout(startGame, 100); // Start the next round
                }
            }
        };

        // Start animations if it's a round transition OR the final transition before game over
        if (currentRound <= MAX_ROUNDS + 1) { // +1 because currentRound has already been incremented
             console.log(`Starting transition animations for round ${currentRound -1} -> ${currentRound > MAX_ROUNDS ? 'Game Over' : currentRound}`);
            currentPhase = GAME_PHASES.TRANSITION; // Ensure transition phase for animations
            isInputBlocked = true;
            console.log("Input BLOCKED for transition.");

            // Start bird animation
            animateBirdFly(animationCompleteCallback);

            // Start cups rolling animation
            animateCupsRollingOff(animationCompleteCallback);

        } else {
             console.log("nextRound called but max rounds already exceeded and not in transition. Doing nothing.");
        }
    }


    function clearGameArea() {
        console.log("Clearing game area...");
        // Remove all existing cup and placeholder elements from the DOM
        cupData.forEach(data => {
            data.cupElement?.remove(); // Use optional chaining in case element is null
            data.placeholderElement?.remove();
        });
        cupData = []; // Clear the cupData array
        activeCupDataIndex = -1; // Reset active cup index

        // Hide and stop the flying bird animation
        if (ui.flyingBird) {
            ui.flyingBird.classList.add('hidden');
        }
        clearInterval(flyingBirdInterval);
        flyingBirdInterval = null;
    }

    // --- Cup Generation & Positioning ---
    function getRandomLetters(count) {
        // Ensure we can get enough unique letters, reset pool if needed
        let availableLetters = [...LETTER_POOL];
        let chosenLetters = [];
        for (let i = 0; i < count; i++) {
            if (availableLetters.length === 0) {
                 // If we run out of letters, refill the pool (though unlikely with 26 letters)
                 availableLetters = [...LETTER_POOL];
            }
            let randIndex = Math.floor(Math.random() * availableLetters.length);
            chosenLetters.push(availableLetters.splice(randIndex, 1)[0]); // Pick and remove letter
        }
        return chosenLetters;
    }

    function generateCupDataForRound(round) {
        // Determine if yellow cups are used this round (1 in 5 chance)
        let yellowReplaces = null; // 'left' or 'right' if yellow is used
        if (Math.random() < 0.2) { // 20% chance for yellow cups
            if (Math.random() < 0.5) {
                yellowReplaces = 'left'; // Yellow replaces blue
            } else {
                yellowReplaces = 'right'; // Yellow replaces red
            }
            console.log(`Yellow cups will replace ${yellowReplaces === 'left' ? 'blue' : 'red'} cups this round.`);
        } else {
            console.log("Using standard blue and red cups this round.");
        }

        let config = {};
        const isSingleStackRound = (round === 3);
        // Formula for number of cups in a stack of height h
        const cupsForTriangle = (h) => h * (h + 1) / 2;

        if (!isSingleStackRound) {
            // Rounds 1, 2, 4: Two stacks of random heights (2-4), not equal height
            let heightLeft, heightRight;
            do {
                heightLeft = Math.floor(Math.random() * 3) + 2; // Height 2, 3, or 4
                heightRight = Math.floor(Math.random() * 3) + 2; // Height 2, 3, or 4
            } while (heightLeft === heightRight); // Ensure heights are different

            config = {
                left: cupsForTriangle(heightLeft),
                right: cupsForTriangle(heightRight),
                isSingleStack: false
            };
        } else {
            // Round 3: Single stack, always 5 cups high
            let height = 5; // Set height to 5 specifically for round 3
            let totalCups = cupsForTriangle(height); // Calculate total cups for height 5

            // Randomly choose whether the single stack is on the left or right
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

        // Get the total number of letters needed and generate them
        const lettersNeeded = config.left + config.right;
        if (lettersNeeded === 0) {
             console.warn("No cups needed for this round's config.");
            return []; // Return empty array if no cups
        }

        const roundLetters = getRandomLetters(lettersNeeded);
        let currentCupData = [];
        let letterIndex = 0; // To track which letter to assign next

        // Create data for left stack cups
        for (let i = 0; i < config.left; i++) {
            let { level, posInLevel } = getLevelAndPos(config.left, i);
            if (level === -1) {
                console.error(`Error calculating level/pos for left cup index ${i}`);
                continue; // Skip this cup if calculation failed
            }
            currentCupData.push({
                letter: roundLetters[letterIndex++],
                side: 'left',
                color: (yellowReplaces === 'left' ? 'yellow' : 'blue'), // Assign color based on yellowReplaces
                stackIndex: i, // Index within its stack
                level: level, // Level in the pyramid (0 is top)
                posInLevel: posInLevel, // Position within the level (0 is left)
                isStacked: false, // Initially unstacked
                placeholderElement: null, // Will store the DOM element
                cupElement: null, // Will store the DOM element
                targetPos: null, // Will store calculated {x, y}
                isSingleStack: config.isSingleStack // Whether this round is a single stack
            });
        }

        // Create data for right stack cups
        for (let i = 0; i < config.right; i++) {
            let { level, posInLevel } = getLevelAndPos(config.right, i);
            if (level === -1) {
                console.error(`Error calculating level/pos for right cup index ${i}`);
                continue; // Skip this cup if calculation failed
            }
            currentCupData.push({
                letter: roundLetters[letterIndex++],
                side: 'right',
                color: (yellowReplaces === 'right' ? 'yellow' : 'red'), // Assign color based on yellowReplaces
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

        // Calculate max level for each side (needed for positioning)
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

        // Assign max level to each cup's data
        currentCupData.forEach(d => {
            d.maxLevel = d.side === 'left' ? maxLevelLeft : maxLevelRight;
        });

        console.log("Generated cup data:", currentCupData.map(d => `${d.letter}(${d.side}-${d.stackIndex}-L${d.level})`));
        return currentCupData;
    }

    function createAndPositionPlaceholders() {
        console.log("Creating placeholders...");
        const gameAreaRect = ui.gameArea.getBoundingClientRect();
        // If gameArea is not ready yet, wait a frame and try again
        if (!gameAreaRect || gameAreaRect.width === 0 || gameAreaRect.height === 0) {
             requestAnimationFrame(createAndPositionPlaceholders);
             return;
        }

        cupData.forEach(data => {
            // Calculate the target position for each cup based on its stack info
            data.targetPos = calculateStackPosition(data, gameAreaRect);

            const placeholder = document.createElement('div');
            placeholder.classList.add('cup-placeholder');
            placeholder.style.left = `${data.targetPos.x}px`;
            placeholder.style.top = `${data.targetPos.y}px`;

            const letterEl = document.createElement('span');
            letterEl.classList.add('cup-letter');
            letterEl.textContent = data.letter;
            placeholder.appendChild(letterEl);

            data.placeholderElement = placeholder; // Store reference to the element
            ui.gameArea.appendChild(placeholder); // Add to the DOM
        });
        console.log("Placeholders created.");

        // Initially update placeholder visibility based on the current active cup
        updatePlaceholderVisibility(activeCupDataIndex);
    }

    // Calculates the screen coordinates for a cup's stacked position
    function calculateStackPosition(cupInfo, gameAreaRect) {
         let stackCenterXPercent;
         if (cupInfo.isSingleStack) {
             stackCenterXPercent = CENTER_STACK_X_PERCENT; // Center for single stack
         } else {
            stackCenterXPercent = cupInfo.side === 'left' ? LEFT_STACK_X_PERCENT : RIGHT_STACK_X_PERCENT; // Left or right for two stacks
         }

        const stackCenterX = gameAreaRect.width * (stackCenterXPercent / 100);
         // Base Y is the bottom of the lowest cup layer
        const baseY = gameAreaRect.height * (BASE_Y_PERCENT / 100) - CUP_HEIGHT;

        // Y position is based on the level relative to the max level (bottom)
        const y = baseY - (cupInfo.maxLevel - cupInfo.level) * LEVEL_OFFSET;

        // Calculate horizontal position within the level
        const cupsInThisLevel = cupInfo.level + 1;
        const levelWidth = (cupsInThisLevel - 1) * CUP_SPACING; // Total width of cups + spacing at this level
        const startXThisLevel = stackCenterX - levelWidth / 2; // X coordinate of the left edge of the first cup in this level

        const x = startXThisLevel + cupInfo.posInLevel * CUP_SPACING; // X coordinate of the left edge of THIS cup

        // Adjust x and y to be the top-left corner of the cup element
        const targetX = x - CUP_WIDTH / 2;
        const targetY = y;

        return { x: targetX, y: targetY };
    }

    // Manages which placeholders are visible (typically only the active row)
    function updatePlaceholderVisibility(activeIndex) {
        if (!cupData || cupData.length === 0) return;

        const isStackingPhase = (currentPhase === GAME_PHASES.STACK_LEFT || currentPhase === GAME_PHASES.STACK_RIGHT);

        let activeLevel = -1;
        let activeSide = null;
         let activeElement = null; // The currently active DOM element (cup or placeholder)

        // Determine the level and side of the actively typed cup/placeholder
        if (activeIndex >= 0 && activeIndex < cupData.length) {
            const activeData = cupData[activeIndex];
            if (activeData) {
                 if (isStackingPhase && !activeData.isStacked) {
                    activeLevel = activeData.level;
                    activeSide = activeData.side;
                    activeElement = activeData.placeholderElement;
                 } else if (!isStackingPhase && activeData.isStacked) {
                     activeLevel = activeData.level;
                     activeSide = activeData.side;
                     activeElement = activeData.cupElement;
                 }
            } else {
                 // Reset if active index is somehow invalid
                 activeIndex = -1;
            }
        }


        cupData.forEach(d => {
            if (d.placeholderElement) {
                // Make placeholder visible if it's on the active side, active level, and not yet stacked
                 if (isStackingPhase && d.side === activeSide && d.level === activeLevel && !d.isStacked) {
                    d.placeholderElement.classList.add('visible');
                    d.placeholderElement.style.opacity = '1'; // Ensure full opacity
                 } else {
                    d.placeholderElement.classList.remove('visible');
                    d.placeholderElement.style.opacity = '0'; // Hide
                    d.placeholderElement.classList.remove('active'); // Remove active class
                 }
            }
            // Remove active class from any cup elements that are not the current active element
            if (d.cupElement && d.cupElement !== activeElement) {
                 d.cupElement.classList.remove('active');
            }
        });

        // Add active class to the determined active element (placeholder or cup)
        if (activeElement) {
             activeElement.classList.add('active');
        }
    }


    // --- Active Cup Management ---
     function setActiveCup(index) {
         // Remove active class from the previously active element if it exists
         if (activeCupDataIndex >= 0 && activeCupDataIndex < cupData.length) {
             const prevData = cupData[activeCupDataIndex];
             if (prevData) {
                 if(prevData.cupElement) prevData.cupElement.classList.remove('active');
                 if(prevData.placeholderElement) prevData.placeholderElement.classList.remove('active');
             }
         }

         activeCupDataIndex = index; // Set the new active index

         // Update the visibility of placeholders and active class based on the new active index
         updatePlaceholderVisibility(activeCupDataIndex);

         // If no active cup was found after setting, try moving to the next phase
         if (activeCupDataIndex === -1 && currentState === GAME_STATES.PLAYING && currentPhase !== GAME_PHASES.TRANSITION) {
            console.log("No active cup found by setActiveCup, trying to move to next phase...");
            // Use a small timeout to ensure the current call stack clears
            setTimeout(moveToNextPhase, 50);
         }
    }


    // --- findNextCupDataIndex (Stack Bottom-Up, Left-Right; Unstack Top-Down, Left-Right) ---
    function findNextCupDataIndex(forPhase = currentPhase) {
        let targetIndex = -1;
        // Determine if we are in a stacking or unstacking phase
        const isStacking = (forPhase === GAME_PHASES.STACK_LEFT || forPhase === GAME_PHASES.STACK_RIGHT);
        // Determine the target side (left or right) for the current phase
        const targetSide = (forPhase === GAME_PHASES.STACK_LEFT || forPhase === GAME_PHASES.UNSTACK_LEFT) ? 'left' : 'right';

        // Filter cups based on the target side and whether they are stacked or not (depending on phase)
        const relevantCups = cupData.filter(d => d.side === targetSide && (isStacking ? !d.isStacked : d.isStacked));

        if (relevantCups.length > 0) {
            let targetLevel;
            if (isStacking) {
                // When stacking, target the highest level (lowest row) that has unstacked cups
                targetLevel = Math.max(...relevantCups.map(d => d.level));
            } else {
                // When unstacking, target the lowest level (topmost row) that has stacked cups
                targetLevel = Math.min(...relevantCups.map(d => d.level));
            }

            // Find cups specifically at the target level
            const cupsInTargetLevel = relevantCups.filter(d => d.level === targetLevel);

            if (cupsInTargetLevel.length > 0) {
                // Within that level, target the cup with the minimum posInLevel (leftmost)
                let targetPosInLevel = Math.min(...cupsInTargetLevel.map(d => d.posInLevel));
                const targetCup = cupsInTargetLevel.find(d => d.posInLevel === targetPosInLevel);

                if (targetCup) {
                     // Find the index of this target cup in the main cupData array
                    targetIndex = cupData.indexOf(targetCup);
                }
            }
        }

        return targetIndex; // Returns -1 if no suitable cup is found for the current phase
    }

    // --- REWRITTEN: moveToNextPhase (Simplified Logic) ---
    function moveToNextPhase() {
        let originalPhase = currentPhase;
        let nextCupIndex = -1;
        let potentialNextPhase = originalPhase; // Start by assuming we stay in the current phase

        console.log(`Entering moveToNextPhase from phase: ${originalPhase}`);

         // If currently in a transition phase, do not attempt to move phase again
        if (originalPhase === GAME_PHASES.TRANSITION) {
            console.log("In TRANSITION phase, exiting moveToNextPhase.");
            return;
        }

        // First, try to find the next cup within the current phase
        nextCupIndex = findNextCupDataIndex(originalPhase);

        // If no next cup found in the current phase, the phase is likely complete
        if (nextCupIndex === -1) {
            console.log(`Phase ${originalPhase} appears complete. Determining next logical phase.`);

            // Determine the next logical phase
            switch (originalPhase) {
                case GAME_PHASES.STACK_LEFT:
                    potentialNextPhase = GAME_PHASES.STACK_RIGHT;
                    break;
                case GAME_PHASES.STACK_RIGHT:
                    potentialNextPhase = GAME_PHASES.UNSTACK_LEFT;
                    break;
                case GAME_PHASES.UNSTACK_LEFT:
                    potentialNextPhase = GAME_PHASES.UNSTACK_RIGHT;
                    break;
                case GAME_PHASES.UNSTACK_RIGHT:
                    console.log("UNSTACK_RIGHT finished. Round should end.");
                    nextRound(); // If the last unstacking phase finishes, end the round
                    return; // Exit the function
            }

            console.log(`Potential next phase is ${potentialNextPhase}. Checking for cups...`);
            // Check if there are cups in the potential next phase
            nextCupIndex = findNextCupDataIndex(potentialNextPhase);

            // If the potential next phase is also empty, skip it and check the next one
            if (nextCupIndex === -1) {
                 console.log(`Potential phase ${potentialNextPhase} is also empty. Skipping.`);
                 let phaseAfterSkip = potentialNextPhase;

                 // Determine the phase after skipping the empty one
                 if (potentialNextPhase === GAME_PHASES.STACK_RIGHT) {
                     phaseAfterSkip = GAME_PHASES.UNSTACK_LEFT;
                 }
                 else if (potentialNextPhase === GAME_PHASES.UNSTACK_LEFT) {
                     phaseAfterSkip = GAME_PHASES.UNSTACK_RIGHT;
                 }
                 else if (potentialNextPhase === GAME_PHASES.UNSTACK_RIGHT) {
                     // If we skipped all the way to UNSTACK_RIGHT and it's also empty, the round is over
                     console.log("Skipped through phases, ending on UNSTACK_RIGHT check. Round should end.");
                     nextRound();
                     return; // Exit the function
                 }

                 potentialNextPhase = phaseAfterSkip;
                 console.log(`Potential phase after skip is ${potentialNextPhase}. Checking for cups...`);
                 nextCupIndex = findNextCupDataIndex(potentialNextPhase);

                 // Final check after potentially skipping two phases
                 if (nextCupIndex === -1 && potentialNextPhase === GAME_PHASES.UNSTACK_RIGHT) {
                      console.log("After skipping phases, UNSTACK_RIGHT is empty. Ending round.");
                      nextRound();
                      return; // Exit the function
                 } else if (nextCupIndex === -1) {
                      // This indicates an unexpected state where phases are empty but the round isn't over
                      console.error(`State Error: Skipped phases, ended on ${potentialNextPhase}, no cup found! Ending round.`);
                      nextRound(); // Treat as round complete
                      return; // Exit the function
                 }
            }

             // If we found a cup in a different phase, update the current phase
            console.log(`Phase changing from ${originalPhase} to ${potentialNextPhase}.`);
            currentPhase = potentialNextPhase;
        }

        // Set the found cup as the active cup. If nextCupIndex is -1, setActiveCup handles the case.
        setActiveCup(nextCupIndex);

        // If a valid next cup was found, unblock input. Otherwise, input remains blocked (handled by nextRound/Game Over).
        if (nextCupIndex !== -1) {
            console.log(`moveToNextPhase found next cup index ${nextCupIndex}. Input UNBLOCKED.`);
            isInputBlocked = false;
        } else {
            console.log(`moveToNextPhase did NOT find a valid next cup index. Input remains BLOCKED (or will be handled by nextRound).`);
        }
    }


    // --- Input Handling ---
    function handleKeyPress(event) {
        // Ignore input if not playing, input is blocked, or no active cup
        if (currentState !== GAME_STATES.PLAYING || isInputBlocked || activeCupDataIndex === -1) {
            return;
        }

        const pressedKey = event.key.toUpperCase();
        // Only process letter keys from the allowed pool
        if (!LETTER_POOL.includes(pressedKey)) return;

        const activeData = cupData[activeCupDataIndex];
        if (!activeData) {
            console.error("handleKeyPress: No active data for index", activeCupDataIndex);
            return; // Should not happen if activeCupDataIndex is not -1
        }

        const isUnstacking = activeData.isStacked; // Determine if we are in an unstacking phase
        const targetElement = isUnstacking ? activeData.cupElement : activeData.placeholderElement; // Get the element to animate
        const targetLetterElement = targetElement?.querySelector('.cup-letter'); // Get the letter element within it

        if (!targetElement) {
            console.error("handleKeyPress: Target element not found for", activeData.letter);
            return; // Should not happen
        }

        // Check if the pressed key matches the active cup's letter
        if (pressedKey === activeData.letter) {
            isInputBlocked = true; // Block input temporarily on correct press
            console.log(`Input BLOCKED by correct keypress for ${activeData.letter}`);
            playAudio(audio.correctType); // Play correct sound

            // Apply flash animation to the letter
            if (targetLetterElement) {
                const flashClass = isUnstacking ? 'flash-green-cup' : 'flash-green-placeholder';
                targetLetterElement.classList.add(flashClass);
                // Remove the flash class after the animation duration
                setTimeout(() => targetLetterElement?.classList.remove(flashClass), isUnstacking ? 150 : 150); // Shorter flash for placeholders
            }

            // Trigger cup animation
            if (!isUnstacking) {
                createAndAnimateCupToStack(activeData); // Stack the cup
            } else {
                animateCupUnstack(activeData); // Unstack the cup
            }

            // Move to the next cup/phase shortly after animation starts (animation is non-blocking)
            setTimeout(moveToNextPhase, 10); // Small delay to allow animation setup

        } else {
            // Incorrect key press
            isInputBlocked = true; // Block input temporarily on incorrect press
            console.log("Input BLOCKED by incorrect keypress.");
            playAudio(audio.incorrectType); // Play incorrect sound

            // Apply shake animation to the cup/placeholder element
            targetElement.classList.add('shake');
             // Apply red flash to the letter
             if (targetLetterElement) {
                const flashClass = isUnstacking ? 'flash-red-cup' : 'flash-red-placeholder';
                targetLetterElement.classList.add(flashClass);
                setTimeout(() => targetLetterElement?.classList.remove(flashClass), isUnstacking ? 200 : 200);
             }


            // Remove shake and unblock input after the shake animation
            setTimeout(() => {
                targetElement?.classList.remove('shake');
                isInputBlocked = false; // Unblock input
                console.log("Input UNBLOCKED after incorrect key shake.");
            }, 300); // Match this with the shake animation duration
        }
    }


    // --- Animations (Do not block next input) ---

    // Animates a newly created cup element moving from staging to its stack position
    function createAndAnimateCupToStack(data) {
        // Remove the placeholder as the actual cup will replace it
        data.placeholderElement?.remove();
        data.placeholderElement = null; // Clear the reference

        const cupElement = document.createElement('div');
        cupElement.classList.add('cup', data.color); // Add base cup class and color class
        cupElement.dataset.letter = data.letter; // Store the letter on the element

        const letterElement = document.createElement('span');
        letterElement.classList.add('cup-letter');
        letterElement.textContent = data.letter;
        cupElement.appendChild(letterElement); // Add letter to the cup

        data.cupElement = cupElement; // Store reference to the cup element

        const stagingArea = document.getElementById('cup-staging-area');
        const stagingRect = stagingArea.getBoundingClientRect();
        const gameAreaRect = ui.gameArea.getBoundingClientRect();

        // Set initial position off-screen at the bottom, within the staging area's horizontal range
        const initialX = stagingRect.left + Math.random() * (stagingRect.width - CUP_WIDTH);
        const initialY = gameAreaRect.height; // Start just below the visible game area

        cupElement.style.left = `${initialX}px`;
        cupElement.style.top = `${initialY}px`;
        // Apply a random initial rotation and slight scale down
        cupElement.style.transform = `rotate(${Math.random() * 60 - 30}deg) scale(0.8)`;
        cupElement.style.opacity = '0'; // Start invisible
        cupElement.style.zIndex = '10'; // Ensure it's above placeholders during animation

        ui.gameArea.appendChild(cupElement); // Add the cup to the game area

        // Force a reflow to ensure the initial styles are applied before transitioning
        void cupElement.offsetWidth;

        // Add class to trigger the stacking animation
        cupElement.classList.add('animating-stack');

        // Set the final target position (should have been calculated already)
        if (!data.targetPos) {
            console.error("Missing targetPos", data.letter);
             // Recalculate if necessary, though this indicates a logic error
            data.targetPos = calculateStackPosition(data, gameAreaRect);
            if(!data.targetPos) {
                // If calculation still fails, remove the element and abort
                cupElement.remove();
                return;
            }
        }
        cupElement.style.left = `${data.targetPos.x}px`;
        cupElement.style.top = `${data.targetPos.y}px`;
        cupElement.style.transform = 'rotate(0deg) scale(1)'; // End with no rotation, normal scale
        cupElement.style.opacity = '1'; // Fade in

        playAudio(audio.cupStack); // Play stack sound

        data.isStacked = true; // Mark the cup as stacked

        // Remove the animating class and add the stacked class after the animation
        setTimeout(() => {
             if (!data.cupElement) return; // Check if element still exists
            data.cupElement.classList.remove('animating-stack');
            data.cupElement.classList.add('stacked');
             // Set z-index based on level so lower cups are behind higher cups
            data.cupElement.style.zIndex = `${5 + (data.maxLevel - data.level)}`;
        }, ANIMATION_DURATION);
    }


    // Animates a stacked cup moving to an unstacked/rolling position
    function animateCupUnstack(data) {
        const cupElement = data.cupElement;
        if (!cupElement) {
            console.warn("animateCupUnstack called with no cupElement ref for", data.letter);
            return; // Exit if element doesn't exist
        }

        data.isStacked = false; // Mark the cup as unstacked immediately

        const gameAreaRect = ui.gameArea.getBoundingClientRect();
        // Target Y is the pre-calculated fixed unstacked level
        const targetY = Math.max(0, unstackedYLevel); // Ensure it's not above the top of the screen
         // Target X is a random position along the bottom of the screen
        const targetX = Math.random() * (gameAreaRect.width - CUP_WIDTH);

        // Get reference to the letter element so we can fade it out
        const letterElement = cupElement.querySelector('.cup-letter');
        if (letterElement) {
             letterElement.style.opacity = '0'; // Start fading out the letter immediately
             letterElement.style.transition = 'opacity 0.4s ease-out'; // Add a transition for the fade
        }

        // Remove stacked/active classes and add unstacking animation class
        cupElement.classList.remove('stacked', 'active');
        cupElement.classList.add('animating-unstack');
        cupElement.style.zIndex = '1'; // Bring to front during unstacking animation

        // Apply the new position and transform
        cupElement.style.left = `${targetX}px`;
        cupElement.style.top = `${targetY}px`;
        cupElement.style.transform = `scale(0.7)`; // Slightly scale down when unstacked
        cupElement.style.opacity = '1'; // Ensure it's visible

        playAudio(audio.cupStack); // Play sound (could be a different sound for unstacking)

         // Note: The cup remains in the DOM at this unstacked position until the round ends and animateCupsRollingOff is called.
    }


    // Animates all unstacked cups rolling off the screen to the left
    function animateCupsRollingOff(callback) {
        console.log("Starting animateCupsRollingOff (Simplified Timeout Logic)");
        playAudio(audio.cupRolling); // Play rolling sound

        const offscreenX = -CUP_WIDTH * 2; // Target X position far off-screen to the left
        const rollDuration = ROLL_ANIMATION_DURATION; // Duration of the rolling animation

        // Get all cup elements currently in the game area
        const domCups = Array.from(ui.gameArea.querySelectorAll('.cup'));
        const cupsToAnimate = domCups.length;
        console.log(`Found ${cupsToAnimate} cups to animate rolling off.`);

        if (cupsToAnimate === 0) {
             console.log("No cups to roll off, calling callback immediately.");
             // Use a small timeout to avoid potential issues with immediate callback execution
             if (callback) { setTimeout(callback, 10); }
             return; // Exit if no cups to animate
        }

        const gameAreaRect = ui.gameArea.getBoundingClientRect();

        domCups.forEach((cupElement, index) => {
             // Use requestAnimationFrame for smooth initial positioning before transition
             requestAnimationFrame(() => {
                 // Double check element still exists before animating
                 if (!cupElement || !cupElement.parentNode) return;

                 // Remove any stacking/unstacking/active classes
                 cupElement.classList.remove('stacked', 'active', 'unstacked', 'animating-stack', 'animating-unstack');
                 cupElement.classList.add('rolling-off'); // Add rolling class

                 // Set z-index to ensure they appear above placeholders but below UI
                 cupElement.style.zIndex = `${3 + index}`; // Simple layering


                 // Explicitly set the transition property to include all transforming properties
                 // and match the animation duration. Use ease-in for accelerating roll effect.
                 cupElement.style.transition = `transform ${rollDuration / 1000}s ease-in, left ${rollDuration / 1000}s ease-in, opacity ${rollDuration / 1000}s ease-in, top ${rollDuration / 1000}s ease-in`;

                 // Get the current position and rotation before applying the new one
                 const currentRect = cupElement.getBoundingClientRect();
                 const currentTop = currentRect.top - gameAreaRect.top; // Position relative to game area top
                 const currentTransform = getComputedStyle(cupElement).transform;


                 let currentRotation = 0;
                  // Try to parse the current rotation from the transform matrix
                  try {
                     const matrix = new DOMMatrixReadOnly.fromMatrix(currentTransform);
                     currentRotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
                  } catch(e) {
                     // Handle potential errors if transform is not a standard matrix
                     console.warn("Could not parse current rotation:", e);
                  }

                  // Use another requestAnimationFrame to apply the final state for the transition to pick up
                  requestAnimationFrame(() => {
                     if (!cupElement || !cupElement.parentNode) return;

                     // Set the final position and transform for the rolling animation
                     cupElement.style.left = `${offscreenX}px`; // Move off-screen left
                     // Add some vertical variation to the rolling path
                     cupElement.style.top = `${currentTop + Math.random() * 50 - 25}px`;
                     // Rotate significantly as it rolls off and scale down slightly
                     cupElement.style.transform = `rotate(${(currentRotation - 360 - Math.random() * 360)}deg) scale(0.8)`;
                     cupElement.style.opacity = '0'; // Fade out as it rolls
                  });
             });
        });

        // After the animation duration, remove the elements from the DOM and call the callback
        setTimeout(() => {
             console.log(`animateCupsRollingOff timeout reached after ${rollDuration}ms.`);
             domCups.forEach(cupElement => {
                  // Remove element if it still exists in the DOM
                  if (cupElement && cupElement.parentNode) {
                     cupElement.remove();
                  }
              });

             // Clear cupElement references in cupData
             cupData.forEach(d => { d.cupElement = null; });

             console.log("All rolling cups removed. Calling final callback.");
             if (callback) {
                 callback(); // Execute the function provided as a callback
             } else {
                  console.warn("animateCupsRollingOff finished but no callback provided.");
             }
        }, rollDuration + 100); // Add a small buffer time
    }


    // --- Bird Animations ---
    // Starts the animation for the instruction screen bird
    function startInstructionBirdAnimation() {
        if (ui.instructionBird) {
            // Change background position to show the animated frame
            ui.instructionBird.style.backgroundPosition = `-150px -192px`;
            console.log("Started instruction bird animation");
        } else {
            console.warn("Instruction bird element not found for animation start.");
        }
    }

    // Stops the animation for the instruction screen bird
    function stopInstructionBirdAnimation() {
         if (ui.instructionBird) {
            // Reset background position to the first frame
            ui.instructionBird.style.backgroundPosition = `0 0`;
            console.log("Stopped instruction bird animation");
        } else {
            console.warn("Instruction bird element not found for animation stop.");
        }
    }


    // Animates the bird flying across the screen
    function animateBirdFly(callback) {
        console.log("Starting animateBirdFly");
        // Check if the necessary elements and audio exist
        if (!audio.birdFly || !ui.flyingBird) {
            console.error("Bird fly audio or element not found! Skipping bird animation.");
            if (callback) setTimeout(callback, 50);
            return;
        }
    
        // Play bird sound (looping) unless muted
        if (!isMuted) {
            audio.birdFly.loop = true;
            audio.birdFly.volume = 1;
            audio.birdFly.play().catch(e => console.warn(`Audio birdFly loop failed:`, e.message));
        }
    
        const gameAreaRect = ui.gameArea.getBoundingClientRect();
        const birdWidth = ui.flyingBird.offsetWidth || 150;
        const startX = gameAreaRect.width;
        const endX = -birdWidth;
        const startY = gameAreaRect.height * 0.25;
        const flightDuration = 2500;
        const birdFPS = 10;
    
        let birdAnimationTimeout = null;
        let birdFrame = 0;
    
        // Reset animation state
        clearInterval(flyingBirdInterval);
        
        // 1. Set initial position WHILE HIDDEN
        ui.flyingBird.style.transition = 'none';
        ui.flyingBird.style.transform = `translateX(${startX}px) translateY(${startY}px) scaleX(1)`;
        ui.flyingBird.style.backgroundPosition = `0 0`;
    
        // 2. Remove hidden class AFTER positioning
        ui.flyingBird.classList.remove('hidden');
    
        // 3. Start sprite animation
        flyingBirdInterval = setInterval(() => {
            birdFrame = (birdFrame + 1) % 2;
            const frameX = birdFrame * -150;
            ui.flyingBird.style.backgroundPosition = `${frameX}px 0px`;
        }, 1000 / birdFPS);
    
        // 4. Delay transition start using requestAnimationFrame
        requestAnimationFrame(() => {
            // 5. Apply transition AFTER element is visible
            ui.flyingBird.style.transition = `transform ${flightDuration / 1000}s linear`;
            ui.flyingBird.style.transform = `translateX(${endX}px) translateY(${startY - gameAreaRect.height * 0.05}px) scaleX(1)`;
        });
    
        // Set cleanup timeout
        birdAnimationTimeout = setTimeout(() => {
            console.log("animateBirdFly cleanup");
            clearInterval(flyingBirdInterval);
            flyingBirdInterval = null;
    
            if (audio.birdFly) {
                audio.birdFly.loop = false;
                audio.birdFly.pause();
                audio.birdFly.currentTime = 0;
            }
    
            ui.flyingBird.classList.add('hidden');
            ui.flyingBird.style.transition = 'none';
    
            if (callback) callback();
        }, flightDuration + 100);
    
        // Handle potential early unmounting
        return () => {
            clearTimeout(birdAnimationTimeout);
            clearInterval(flyingBirdInterval);
        };
    }


    // --- Timer & Scoring ---

    // Starts the game timer
    function startTimer() {
        if (timerInterval) return; // Prevent starting multiple intervals

        // Ensure elapsedTime is a number before starting
        elapsedTime = Number(elapsedTime) || 0;
        const startTime = Date.now() - elapsedTime * 1000; // Calculate the actual start time

        // Update timer display every 100ms
        timerInterval = setInterval(() => {
            elapsedTime = (Date.now() - startTime) / 1000; // Calculate elapsed time in seconds
            updateTimerDisplay();
        }, 100);
    }

    // Stops the game timer
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null; // Clear the interval ID
        }
    }

    // Updates the timer display text
    function updateTimerDisplay() {
        ui.timer.textContent = elapsedTime.toFixed(1); // Display with one decimal place
    }

    // Updates the round counter display text
    function updateRoundCounter() {
        ui.roundCounter.textContent = `${currentRound}/${MAX_ROUNDS}`;
    }

    // Updates the final score and best time on the game over screen
    function updateScores() {
        const currentTime = parseFloat(elapsedTime.toFixed(1)); // Get final time as a number

        ui.finalTime.textContent = `YOUR TIME: ${currentTime} SECONDS`;

        const bestTime = loadBestTime(); // Load previous best time

        // Check if current time is a new best time
        if (bestTime === null || currentTime < bestTime) {
            saveBestTime(currentTime); // Save the new best time
            ui.bestTime.textContent = `NEW BEST TIME: ${currentTime} SECONDS`;
        } else {
            ui.bestTime.textContent = `BEST TIME: ${bestTime} SECONDS`;
        }
    }

    // Saves the best time to local storage
    function saveBestTime(time) {
        try {
            localStorage.setItem('cupStackTypingBestTime', time);
        } catch (e) {
            console.error("LS Error saving best time:", e);
            // Handle potential localStorage errors (e.g., storage full, privacy settings)
        }
    }

    // Loads the best time from local storage
    function loadBestTime() {
        try {
            const bt = localStorage.getItem('cupStackTypingBestTime');
            return bt ? parseFloat(bt) : null; // Return null if no time is saved
        } catch (e) {
            console.error("LS Error loading best time:", e);
            return null; // Return null on error
        }
    }

    // --- Audio Control ---

    // Plays an audio element
    function playAudio(audioElement, volume = 1) {
        // Only play if not muted and element exists
        if (!isMuted && audioElement) {
            // Clone the audio element to allow multiple sounds to play simultaneously
            const clonedAudio = audioElement.cloneNode(true);
            clonedAudio.volume = Math.max(0, Math.min(1, volume)); // Clamp volume between 0 and 1
            clonedAudio.play().catch(e => {
                // Catch and ignore common audio play errors (e.g., user gesture required)
                if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
                    console.warn(`Audio play failed:`, e.message);
                }
            });
            return clonedAudio; // Return the cloned audio element
        }
        return null; // Return null if audio didn't play
    }

    // Toggles mute state for all audio elements
    function toggleMute() {
        isMuted = !isMuted; // Toggle the state
        console.log("Muted:", isMuted);

        // Set the muted property on all tracked audio elements
        audio.all.forEach(aud => aud.muted = isMuted);

        // Update the mute button icon
        ui.muteIcon.src = isMuted ? 'assets/UI/Muted.png' : 'assets/UI/Unmuted.png';

        // Play button click sound unless already muted before the toggle
        // This check ensures the sound plays when unmuting via the button
        if (audio.buttonClick) {
             // Temporarily override mute state for this specific sound if needed, or just let playAudio handle it
            playAudio(audio.buttonClick);
        }
    }


    // --- Run Initialization ---
    init();
});
