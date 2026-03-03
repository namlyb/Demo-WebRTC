import pokemon from "pokemon";

class RandomNameService {
  static generate() {
    try {
      return pokemon.random("en");
    } catch (err) {
      return "Guest";
    }
  }
}

export default RandomNameService;