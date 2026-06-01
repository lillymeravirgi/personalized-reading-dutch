import unittest
from unittest.mock import MagicMock, patch

import app.session_generator as session_generator


class SessionGenerationRulesTest(unittest.TestCase):
    def test_yellow_word_sampling_uses_feature_ratio(self):
        rows = [MagicMock() for _ in range(10)]
        db = MagicMock()
        learning_query = MagicMock()
        learning_query.filter.return_value.join.return_value.all.return_value = rows
        db.query.return_value = learning_query

        with patch("app.session_generator.random.sample", side_effect=lambda population, k: population[:k]):
            selected = session_generator._fetch_yellow_words("user-1", db)

        self.assertEqual(1, len(selected))

    def test_blue_word_sampling_uses_feature_ratio(self):
        rows = [MagicMock() for _ in range(10)]
        db = MagicMock()
        db.query.return_value.filter.return_value.join.return_value.all.return_value = rows

        with patch("app.session_generator.random.sample", side_effect=lambda population, k: population[:k]):
            selected = session_generator._fetch_blue_words("user-1", db)

        self.assertEqual(1, len(selected))


if __name__ == "__main__":
    unittest.main()
