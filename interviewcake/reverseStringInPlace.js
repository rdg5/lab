"abc -> cba";

const reverseString = (arrayOfChars) => {
  let leftIndex = 0;
  let rightIndex = arrayOfChars.length - 1;

  while (leftIndex < rightIndex) {
    // Swap characters
    const temp = arrayOfChars[leftIndex];
    arrayOfChars[leftIndex] = arrayOfChars[rightIndex];
    arrayOfChars[rightIndex] = temp;

    // Move towards middle
    leftIndex++;
    rightIndex--;
  }
  return arrayOfChars.join("");
};

console.log(reverseString(["c", "i", "c", "a"]));
