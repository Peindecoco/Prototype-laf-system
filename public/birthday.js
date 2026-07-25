const yesButton = document.getElementById('yesButton');
const noButton = document.getElementById('noButton');
const answerStage = document.getElementById('answerStage');
const hintText = document.getElementById('hintText');
const questionCard = document.getElementById('questionCard');
const celebration = document.getElementById('celebration');

const maxDodges = 10;
let dodgeCount = 0;
let canClickYes = false;
let lastPosition = null;

function moveYesButton() {
  if (canClickYes) return;

  dodgeCount += 1;
  const stageRect = answerStage.getBoundingClientRect();
  const buttonRect = yesButton.getBoundingClientRect();
  const maxLeft = Math.max(stageRect.width - buttonRect.width, 0);
  const maxTop = Math.max(stageRect.height - buttonRect.height, 0);

  const minimumTravel = Math.min(180, Math.max(stageRect.width, stageRect.height) * 0.35);
  let nextLeft = 0;
  let nextTop = 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    nextLeft = Math.floor(Math.random() * maxLeft);
    nextTop = Math.floor(Math.random() * maxTop);

    if (!lastPosition) break;

    const travelDistance = Math.hypot(nextLeft - lastPosition.left, nextTop - lastPosition.top);
    if (travelDistance >= minimumTravel) break;
  }

  yesButton.style.left = `${nextLeft}px`;
  yesButton.style.top = `${nextTop}px`;
  lastPosition = { left: nextLeft, top: nextTop };
  hintText.textContent = `Almost! Catch it ${Math.max(maxDodges - dodgeCount, 0)} more time${maxDodges - dodgeCount === 1 ? '' : 's'} 💕`;

  if (dodgeCount >= maxDodges) {
    canClickYes = true;
    yesButton.classList.add('caught');
    yesButton.style.left = 'calc(50% - 68px)';
    yesButton.style.top = '44px';
    hintText.textContent = 'Okay okay, you can click Yes now! 🎂';
  }
}

function showCelebration() {
  if (!canClickYes) {
    moveYesButton();
    return;
  }

  document.body.classList.add('birthday-unlocked');
  questionCard.classList.add('hidden');
  celebration.classList.remove('hidden');
}

yesButton.addEventListener('pointerenter', moveYesButton);
yesButton.addEventListener('focus', moveYesButton);
yesButton.addEventListener('click', showCelebration);

noButton.addEventListener('click', () => {
  hintText.textContent = 'Hmm... the confetti says you should try Yes instead 🎉';
});
